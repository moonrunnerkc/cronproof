/**
 * Source-location primitives shared by every scanner. A LineIndex maps
 * a character offset back to a 1-based line and column so a finding
 * points at the exact byte the schedule value starts on. The keyed
 * string finders cover the two shapes config files use, YAML/TOML
 * "key: value" and "key = value", without pulling in a YAML or TOML
 * parser, which the repo deliberately has no runtime dependency on.
 */

/** A located string value read out of a config file. */
export interface LocatedString {
  /** The unquoted value. */
  value: string;
  /** 1-based line of the value's first character. */
  line: number;
  /** 1-based column of the value's first character. */
  column: number;
  /** Character offset of the value's first character. */
  offset: number;
}

/**
 * Precomputed newline offsets for one text, turning an offset into a
 * 1-based line and column in O(log n). Build once per file, reuse for
 * every match.
 */
export class LineIndex {
  private readonly lineStarts: number[];

  /**
   * Builds the index over the given text.
   * @param text Full file contents.
   */
  constructor(private readonly text: string) {
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10) {
        this.lineStarts.push(i + 1);
      }
    }
  }

  /**
   * Maps a character offset to a 1-based line and column.
   * @param offset Character offset into the text.
   * @returns The 1-based line and column of that offset.
   * @throws Never; out-of-range offsets clamp to the text bounds.
   */
  locate(offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      const start = this.lineStarts[mid];
      if (start !== undefined && start <= clamped) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    const lineStart = this.lineStarts[low] ?? 0;
    return { line: low + 1, column: clamped - lineStart + 1 };
  }
}

/** Strips one matching pair of surrounding single or double quotes. */
export function unquote(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return trimmed.slice(1, trimmed.length - 1);
    }
  }
  return trimmed;
}

/**
 * True when a value carries an unexpanded template expression that the
 * scanner must not parse as a literal schedule: Helm/Go `{{ ... }}`,
 * Jinja `{{ ... }}`, or shell/CI `${...}` interpolation.
 * @param value Raw or unquoted value text.
 * @returns Whether the value contains a template marker.
 */
export function looksTemplated(value: string): boolean {
  return /\{\{.*?\}\}|\$\{.*?\}|<%.*?%>/.test(value);
}

// Allows an optional closing quote after the key so JSON's "schedule":
// matches as well as YAML's schedule:, and prefers a quoted value so a
// trailing "}," or "," in JSON is not swept into the value.
const KEY_COLON = (key: string): RegExp =>
  new RegExp(`(^|\\n)([^\\n#]*?\\b${key}["']?\\s*:\\s*)("[^"]*"|'[^']*'|[^\\n#,]+)`, 'g');

const KEY_EQUALS = (key: string): RegExp =>
  new RegExp(`(^|\\n)([^\\n#]*?\\b${key}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\n#]+)`, 'g');

/**
 * Finds every `key: value` occurrence (YAML style) and locates the
 * value. The value keeps its source quoting so callers can decide how
 * to unquote; the position points at the first value character.
 * @param index Line index for the text.
 * @param text Full file contents.
 * @param key Bare key name to match (word-bounded).
 * @returns One entry per occurrence, value verbatim (quotes intact).
 */
export function findColonValues(index: LineIndex, text: string, key: string): LocatedString[] {
  return collect(index, text, KEY_COLON(key));
}

/**
 * Finds every `key = value` occurrence (TOML/HCL style) and locates
 * the value.
 * @param index Line index for the text.
 * @param text Full file contents.
 * @param key Bare key name to match (word-bounded).
 * @returns One entry per occurrence, value verbatim (quotes intact).
 */
export function findEqualsValues(index: LineIndex, text: string, key: string): LocatedString[] {
  return collect(index, text, KEY_EQUALS(key));
}

/**
 * Locates every single- or double-quoted string within a slice of the
 * text. Used for array-valued config keys such as wrangler's
 * `crons = ["...", "..."]`, where each element needs its own position.
 * @param index Line index for the whole text.
 * @param text Full file contents.
 * @param start Inclusive start offset of the slice.
 * @param end Exclusive end offset of the slice.
 * @returns One entry per quoted string, value unquoted, position at the
 *          opening quote.
 */
export function locateQuoted(
  index: LineIndex,
  text: string,
  start: number,
  end: number,
): LocatedString[] {
  const out: LocatedString[] = [];
  const pattern = /"([^"]*)"|'([^']*)'/g;
  pattern.lastIndex = start;
  let match = pattern.exec(text);
  while (match !== null && match.index < end) {
    const value = match[1] ?? match[2] ?? '';
    const position = index.locate(match.index);
    out.push({ value, line: position.line, column: position.column, offset: match.index });
    match = pattern.exec(text);
  }
  return out;
}

function collect(index: LineIndex, text: string, pattern: RegExp): LocatedString[] {
  const out: LocatedString[] = [];
  let match = pattern.exec(text);
  while (match !== null) {
    const lead = match[1] ?? '';
    const prefix = match[2] ?? '';
    const rawValue = (match[3] ?? '').replace(/\s+$/, '');
    const valueOffset = match.index + lead.length + prefix.length;
    const position = index.locate(valueOffset);
    out.push({
      value: rawValue,
      line: position.line,
      column: position.column,
      offset: valueOffset,
    });
    match = pattern.exec(text);
  }
  return out;
}
