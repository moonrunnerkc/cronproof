/**
 * Serverless and PaaS schedule scanners: Cloudflare Wrangler cron
 * triggers, Vercel vercel.json crons, Render render.yaml cron jobs, and
 * Netlify netlify.toml scheduled functions. Each of these platforms
 * runs its cron in UTC with no per-job zone knob, so the zone source is
 * a platform default of UTC. See DECISIONS.md for the cited docs behind
 * each UTC rule.
 */

import {
  LineIndex,
  findColonValues,
  findEqualsValues,
  locateQuoted,
  maskComments,
  unquote,
  type CommentStyle,
} from '../text-locate';
import type { ScanFile, ScheduleFinding, SourceKind } from '../types';

function utcFinding(
  file: ScanFile,
  line: number,
  column: number,
  sourceKind: SourceKind,
  expression: string,
  rule: string,
): ScheduleFinding {
  return {
    file: file.path,
    line,
    column,
    sourceKind,
    dialect: 'vixie',
    expression,
    resolution: 'resolved',
    zoneSource: { kind: 'platform-default', zone: 'UTC', rule },
    warnings: [],
  };
}

// Wrangler config is TOML or, since the JSON config format, .json/.jsonc,
// so the trigger array arrives as either `crons = [...]` or `"crons": [...]`.
const CRONS_ARRAY = /\bcrons["']?\s*[:=]\s*\[/g;

function wranglerCommentStyle(path: string): CommentStyle {
  return path.toLowerCase().endsWith('.toml') ? 'hash' : 'slash';
}

/**
 * Scans a Wrangler config (wrangler.toml, wrangler.json, wrangler.jsonc)
 * for `crons` trigger arrays, which Cloudflare runs in UTC.
 * @param file The config file to scan.
 * @returns One finding per cron trigger, positioned at its opening quote.
 */
export function scanWrangler(file: ScanFile): ScheduleFinding[] {
  const text = maskComments(file.text, wranglerCommentStyle(file.path));
  const index = new LineIndex(text);
  const findings: ScheduleFinding[] = [];
  const pattern = new RegExp(CRONS_ARRAY.source, 'g');
  let match = pattern.exec(text);
  while (match !== null) {
    // Scan from just past the opening bracket. Starting at the match would
    // pair the JSON key's closing quote with the first element's opening
    // quote and yield the punctuation between them as a schedule.
    const open = match.index + match[0].length;
    const close = text.indexOf(']', open);
    const end = close === -1 ? text.length : close;
    for (const located of locateQuoted(index, text, open, end)) {
      findings.push(
        utcFinding(
          file,
          located.line,
          located.column,
          'wrangler',
          located.value,
          'Cloudflare Workers Cron Triggers run in UTC',
        ),
      );
    }
    match = pattern.exec(text);
  }
  return findings;
}

/** Scans a vercel.json for crons[].schedule values (UTC). */
export function scanVercel(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  return findColonValues(index, file.text, 'schedule').map((located) =>
    utcFinding(
      file,
      located.line,
      located.column,
      'vercel',
      unquote(located.value),
      'Vercel Cron Jobs run in UTC',
    ),
  );
}

/** Scans a render.yaml for cron job `schedule:` values (UTC). */
export function scanRender(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  return findColonValues(index, file.text, 'schedule').map((located) =>
    utcFinding(
      file,
      located.line,
      located.column,
      'render',
      unquote(located.value),
      'Render cron jobs run in UTC',
    ),
  );
}

/** Scans a netlify.toml for scheduled-function `schedule = "..."` (UTC). */
export function scanNetlify(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  return findEqualsValues(index, file.text, 'schedule').map((located) =>
    utcFinding(
      file,
      located.line,
      located.column,
      'netlify',
      unquote(located.value),
      'Netlify Scheduled Functions run in UTC',
    ),
  );
}
