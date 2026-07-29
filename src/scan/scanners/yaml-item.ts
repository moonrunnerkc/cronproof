/**
 * Indentation-scoped reading of YAML block mappings and sequences,
 * without a YAML parser (this repo carries no runtime dependencies).
 *
 * Two questions a schedule scanner has to answer are both scoping
 * questions, and both are wrong when answered by proximity. "Which
 * timezone key governs this cron key" is answered by the sequence item
 * the cron key sits in, not by the nearest timezone line: a nearby-line
 * search lets the next list item's zone leak onto this one, which is
 * worse than reading no zone at all. "Which prose annotates this cron
 * key" is answered by walking outward through the keys that enclose it,
 * stopping at the first sibling, because a comment above a different
 * list item annotates that item.
 *
 * The lookback is capped rather than unbounded on purpose. A wide
 * window finds the file-header comment that a real workflow puts six
 * lines and two keys above its cron, and a wider one starts pulling in
 * unrelated prose from elsewhere in the file. The budget is precision,
 * not distance.
 */

/** One parsed `key: value` line, with the geometry needed to scope it. */
export interface KeyLine {
  /** Everything up to the value: indent, any `- `, the key, the colon. */
  prefix: string;
  /**
   * Column the key starts at, counting a sequence dash as indentation.
   * `- cron:` at four spaces indents its key to six, which is exactly
   * where a sibling `timezone:` in the same item must start.
   */
  keyIndent: number;
  /** Whether this line opens a sequence item (`- key: value`). */
  startsItem: boolean;
  /** The bare key name. */
  name: string;
  /** Everything after the colon, verbatim, comment and quotes intact. */
  value: string;
}

const KEY_LINE = /^((\s*)(-\s+)?([A-Za-z][A-Za-z0-9_.-]*)\s*:\s*)(.*)$/;

/** Inclusive line range of one sequence item, as 0-based indices. */
export interface ItemBounds {
  /** First line of the item. */
  start: number;
  /** Last line of the item. */
  end: number;
}

/** How far back intentContext will look for annotating prose. */
const LOOKBACK_LIMIT = 12;

/**
 * Parses one line as a YAML block-mapping key.
 * @param line A single source line, without its newline.
 * @returns The parsed key line, or null when the line is blank, a
 *          comment, a bare sequence scalar, or anything else that does
 *          not open a `key:` mapping. Comments never parse, because `#`
 *          is not a key-name character.
 */
export function parseKeyLine(line: string): KeyLine | null {
  const match = KEY_LINE.exec(line);
  if (match === null) {
    return null;
  }
  const indent = match[2] ?? '';
  const dash = match[3];
  return {
    prefix: match[1] ?? '',
    keyIndent: indent.length + (dash === undefined ? 0 : dash.length),
    startsItem: dash !== undefined,
    name: match[4] ?? '',
    value: match[5] ?? '',
  };
}

function isSkippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/**
 * True when a line ends the scope of the item `key` belongs to: a key
 * shallower than it (the enclosing block), a key at its own indent that
 * opens a new item, or any non-key content.
 */
function leavesItem(line: string, key: KeyLine): boolean {
  const parsed = parseKeyLine(line);
  if (parsed === null) {
    return true;
  }
  if (parsed.keyIndent > key.keyIndent) {
    return false;
  }
  return parsed.keyIndent < key.keyIndent || parsed.startsItem;
}

/**
 * Finds the sequence item a key line belongs to.
 * @param lines All lines of the file.
 * @param index 0-based index of the key line.
 * @param key The parsed key line at that index.
 * @returns Inclusive bounds of the item, which collapse to the key's
 *          own line when the key opens the item and nothing follows it.
 */
export function itemBounds(lines: string[], index: number, key: KeyLine): ItemBounds {
  let start = index;
  if (!key.startsItem) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const line = lines[i] ?? '';
      if (isSkippable(line)) {
        continue;
      }
      const parsed = parseKeyLine(line);
      if (parsed === null || parsed.keyIndent < key.keyIndent) {
        break;
      }
      if (parsed.keyIndent === key.keyIndent) {
        start = i;
        if (parsed.startsItem) {
          break;
        }
      }
    }
  }
  let end = index;
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isSkippable(line)) {
      continue;
    }
    if (leavesItem(line, key)) {
      break;
    }
    end = i;
  }
  return { start, end };
}

function commentOf(line: string): string {
  const hash = line.indexOf('#');
  return hash === -1 ? '' : line.slice(hash + 1);
}

/**
 * Collects the prose that annotates one key line: its own trailing
 * comment, then every comment and enclosing `name:` value found by
 * walking outward through the keys that contain it.
 *
 * The walk crosses blank lines and keys shallower than the target,
 * which is what reaches a comment written at the top of the file above
 * `name:` and `on:`. It stops at the first key at the target's own
 * indent or deeper, because that is a sibling or a previous item's
 * body, and prose there belongs to that item and not to this one.
 * @param lines All lines of the file.
 * @param index 0-based index of the key line.
 * @param key The parsed key line at that index.
 * @returns The collected prose, newline-joined; empty when there is none.
 */
export function intentContext(lines: string[], index: number, key: KeyLine): string {
  const parts: string[] = [commentOf(lines[index] ?? '')];
  const floor = Math.max(0, index - LOOKBACK_LIMIT);
  for (let i = index - 1; i >= floor; i -= 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed.startsWith('#')) {
      parts.push(commentOf(line));
      continue;
    }
    const parsed = parseKeyLine(line);
    if (parsed === null || parsed.keyIndent >= key.keyIndent) {
      break;
    }
    if (parsed.name === 'name') {
      parts.push(parsed.value);
    }
  }
  return parts.join(' \n ');
}
