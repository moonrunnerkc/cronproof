/**
 * Crontab scanner. Handles both a user crontab (five time fields then
 * a command) and a system crontab such as /etc/crontab or a file under
 * cron.d (five time fields, then a user column, then a command).
 *
 * The scanner tracks CRON_TZ and TZ assignments as it walks: each sets
 * the timezone for entries that appear after it, and a later assignment
 * overrides an earlier one. An entry before any such line has an
 * UNKNOWN zone, because a bare crontab runs in the daemon's local time,
 * which is not knowable from the file.
 */

import type { ScanFile, ScheduleFinding, ZoneSource } from '../types';

interface Token {
  text: string;
  offset: number;
}

const ENV_ASSIGN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(line);
  while (match !== null) {
    tokens.push({ text: match[0], offset: match.index });
    match = pattern.exec(line);
  }
  return tokens;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && last === first) {
      return value.slice(1, -1);
    }
  }
  return value;
}

interface ZoneState {
  zone: string;
  fromLine: number;
  via: 'CRON_TZ' | 'TZ';
}

function fieldCount(tokens: Token[]): number {
  const first = tokens[0];
  if (first !== undefined && first.text.startsWith('@')) {
    return 1;
  }
  return 5;
}

function buildFinding(
  file: ScanFile,
  lineNumber: number,
  tokens: Token[],
  fields: number,
  zoneState: ZoneState | null,
  hasUserColumn: boolean,
): ScheduleFinding | null {
  const commandTokensNeeded = fields + (hasUserColumn ? 1 : 0) + 1;
  if (tokens.length < commandTokensNeeded) {
    return null;
  }
  const firstField = tokens[0];
  if (firstField === undefined) {
    return null;
  }
  const expression = tokens
    .slice(0, fields)
    .map((token) => token.text)
    .join(' ');
  const zoneSource: ZoneSource =
    zoneState === null
      ? { kind: 'unknown' }
      : { kind: 'inherited', zone: zoneState.zone, fromLine: zoneState.fromLine, via: zoneState.via };
  return {
    file: file.path,
    line: lineNumber,
    column: firstField.offset + 1,
    sourceKind: 'crontab',
    dialect: hasUserColumn ? 'debian' : 'vixie',
    expression,
    resolution: 'resolved',
    zoneSource,
    warnings: [],
  };
}

/**
 * Scans a crontab file for schedule entries and CRON_TZ/TZ inheritance.
 * @param file The file to scan.
 * @param hasUserColumn True for a system crontab that carries a user
 *        column between the time fields and the command.
 * @returns One finding per schedule entry, in file order.
 */
export function scanCrontab(file: ScanFile, hasUserColumn: boolean): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  const lines = file.text.split('\n');
  let zoneState: ZoneState | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trimStart();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const env = ENV_ASSIGN.exec(line);
    if (env !== null) {
      const name = env[1];
      const value = stripQuotes(env[2] ?? '');
      if (name === 'CRON_TZ' || name === 'TZ') {
        zoneState = { zone: value, fromLine: i + 1, via: name };
      }
      continue;
    }
    const tokens = tokenize(line);
    const finding = buildFinding(file, i + 1, tokens, fieldCount(tokens), zoneState, hasUserColumn);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

/** Scans a user crontab (no user column). */
export function scanUserCrontab(file: ScanFile): ScheduleFinding[] {
  return scanCrontab(file, false);
}

/** Scans a system crontab such as /etc/crontab (user column present). */
export function scanSystemCrontab(file: ScanFile): ScheduleFinding[] {
  return scanCrontab(file, true);
}
