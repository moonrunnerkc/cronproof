/**
 * Inline suppression comments. A schedule finding can be silenced with
 * a comment carrying the directive `cronproof-ignore` on the same line
 * as the finding or on the line directly above it. A suppression MUST
 * state a reason: a bare `cronproof-ignore` with no reason is rejected
 * and reported as a diagnostic, because an unexplained suppression is
 * how a real hazard gets buried.
 *
 * The comment leader is not constrained, so `#`, `//`, and `--` style
 * comments across crontab, YAML, TOML, HCL, JS, and Python all work.
 */

/** A suppression directive parsed out of one source line. */
export interface SuppressionDirective {
  /** 1-based line the directive sits on. */
  line: number;
  /** The reason text, or null when none was given (an error). */
  reason: string | null;
}

const DIRECTIVE = /cronproof-ignore\b[ \t]*(?::[ \t]*(.*?))?[ \t]*(?:-->|\*\/)?\s*$/;

/**
 * Extracts every suppression directive from a file's text.
 * @param text Full file contents.
 * @returns One directive per line that carries the marker, with the
 *          reason captured or null when the reason is missing or blank.
 */
export function parseSuppressions(text: string): SuppressionDirective[] {
  const out: SuppressionDirective[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || !line.includes('cronproof-ignore')) {
      continue;
    }
    const match = DIRECTIVE.exec(line);
    if (match === null) {
      continue;
    }
    const captured = match[1];
    const reason = captured !== undefined && captured.trim().length > 0 ? captured.trim() : null;
    out.push({ line: i + 1, reason });
  }
  return out;
}

/**
 * Resolves the suppression that applies to a finding on a given line.
 * A finding is covered by a directive on its own line or the line
 * immediately above it.
 * @param directives All directives parsed from the file.
 * @param findingLine 1-based line of the finding.
 * @returns The applicable directive, or null when none covers the line.
 */
export function suppressionFor(
  directives: SuppressionDirective[],
  findingLine: number,
): SuppressionDirective | null {
  for (const directive of directives) {
    if (directive.line === findingLine || directive.line === findingLine - 1) {
      return directive;
    }
  }
  return null;
}
