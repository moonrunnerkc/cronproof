/**
 * Serverless and PaaS schedule scanners: Cloudflare wrangler.toml cron
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
  unquote,
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

/** Scans a wrangler.toml for `crons = [...]` trigger arrays (UTC). */
export function scanWrangler(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  const findings: ScheduleFinding[] = [];
  const pattern = /\bcrons\s*=\s*\[/g;
  let match = pattern.exec(file.text);
  while (match !== null) {
    const close = file.text.indexOf(']', match.index);
    const end = close === -1 ? file.text.length : close;
    for (const located of locateQuoted(index, file.text, match.index, end)) {
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
    match = pattern.exec(file.text);
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
