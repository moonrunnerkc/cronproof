/**
 * Hand-rolled argument parsing for the cronproof CLI. Returns a typed
 * command on success or a usage message on error, so the caller can
 * map a parse failure to exit code 2 without a dependency.
 */

import type { DialectId } from '../cron/index';
import type { Severity } from '../hazard/index';
import type { Command, DateArg, Format } from './types';

const FORMATS: Format[] = ['human', 'json', 'sarif', 'junit', 'markdown'];
const SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
const DIALECTS: DialectId[] = [
  'vixie',
  'debian',
  'quartz',
  'k8s',
  'systemd',
  'github-actions',
  'aws-eventbridge',
];
const COMMANDS: Command[] = ['check', 'scan', 'explain', 'zones', 'baseline'];

/** Fully parsed and validated CLI invocation. */
export interface ParsedArgs {
  command: Command;
  format: Format;
  positional: string | null;
  zone: string | null;
  from: DateArg | null;
  to: DateArg | null;
  at: { text: string; utcMillis: number } | null;
  dialect: DialectId;
  failOn: Severity;
  idempotent: boolean;
  zoneinfoRoot: string | null;
  hazardWindow: { from: DateArg; to: DateArg } | null;
  baseline: string | null;
  out: string | null;
  tzdbCheck: string | null;
}

/** Result of parsing: a command, or a usage error to print on stderr. */
export type ParseResult = { ok: true; args: ParsedArgs } | { ok: false; message: string };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseDate(text: string): DateArg | null {
  const dateOnly = DATE_ONLY.exec(text);
  const dateTime = DATE_TIME.exec(text);
  const match = dateOnly ?? dateTime;
  if (match === null) {
    return null;
  }
  return {
    text,
    fields: {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] ?? 0),
      minute: Number(match[5] ?? 0),
      second: Number(match[6] ?? 0),
    },
  };
}

interface Flags {
  values: Map<string, string>;
  booleans: Set<string>;
  positionals: string[];
}

function tokenize(argv: string[]): Flags | { error: string } {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const positionals: string[] = [];
  const boolFlags = new Set(['idempotent', 'help']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        values.set(body.slice(0, eq), body.slice(eq + 1));
      } else if (boolFlags.has(body)) {
        booleans.add(body);
      } else {
        const next = argv[i + 1];
        if (next === undefined) {
          return { error: `flag --${body} needs a value` };
        }
        values.set(body, next);
        i += 1;
      }
    } else {
      positionals.push(token);
    }
  }
  return { values, booleans, positionals };
}

function oneOf<T extends string>(value: string, allowed: T[], label: string): T | { error: string } {
  if ((allowed as string[]).includes(value)) {
    return value as T;
  }
  return { error: `invalid ${label} "${value}"; expected one of ${allowed.join(', ')}` };
}

/** Parses argv (without node and script) into a command or a usage error. */
export function parseArgs(argv: string[]): ParseResult {
  const tokens = tokenize(argv);
  if ('error' in tokens) {
    return { ok: false, message: tokens.error };
  }
  const { values, booleans, positionals } = tokens;

  const commandText = positionals[0];
  if (commandText === undefined) {
    return { ok: false, message: 'missing command; expected one of check, scan, explain, zones' };
  }
  const command = oneOf<Command>(commandText, COMMANDS, 'command');
  if (typeof command !== 'string') {
    return { ok: false, message: command.error };
  }

  const format = oneOf<Format>(values.get('format') ?? 'human', FORMATS, 'format');
  if (typeof format !== 'string') {
    return { ok: false, message: format.error };
  }
  const dialect = oneOf<DialectId>(values.get('dialect') ?? 'vixie', DIALECTS, 'dialect');
  if (typeof dialect !== 'string') {
    return { ok: false, message: dialect.error };
  }
  const failOn = oneOf<Severity>(values.get('fail-on') ?? 'high', SEVERITIES, 'fail-on');
  if (typeof failOn !== 'string') {
    return { ok: false, message: failOn.error };
  }

  let from: DateArg | null = null;
  let to: DateArg | null = null;
  for (const [key, target] of [['from', 'from'], ['to', 'to']] as const) {
    const raw = values.get(key);
    if (raw !== undefined) {
      const parsed = parseDate(raw);
      if (parsed === null) {
        return { ok: false, message: `--${key} "${raw}" is not a YYYY-MM-DD or YYYY-MM-DDTHH:MM date` };
      }
      if (target === 'from') {
        from = parsed;
      } else {
        to = parsed;
      }
    }
  }

  let at: { text: string; utcMillis: number } | null = null;
  const atRaw = values.get('at');
  if (atRaw !== undefined) {
    const millis = Date.parse(atRaw);
    if (Number.isNaN(millis)) {
      return { ok: false, message: `--at "${atRaw}" is not a valid ISO instant` };
    }
    at = { text: atRaw, utcMillis: millis };
  }

  let hazardWindow: { from: DateArg; to: DateArg } | null = null;
  const windowRaw = values.get('hazard-window');
  if (windowRaw !== undefined) {
    const parts = windowRaw.split('..');
    const windowFrom = parseDate(parts[0] ?? '');
    const windowTo = parseDate(parts[1] ?? '');
    if (parts.length !== 2 || windowFrom === null || windowTo === null) {
      return { ok: false, message: `--hazard-window "${windowRaw}" must be FROM..TO with YYYY-MM-DD dates` };
    }
    hazardWindow = { from: windowFrom, to: windowTo };
  }

  return {
    ok: true,
    args: {
      command,
      format,
      positional: positionals[1] ?? null,
      zone: values.get('tz') ?? values.get('zone') ?? null,
      from,
      to,
      at,
      dialect,
      failOn,
      idempotent: booleans.has('idempotent'),
      zoneinfoRoot: values.get('zoneinfo-root') ?? null,
      hazardWindow,
      baseline: values.get('baseline') ?? null,
      out: values.get('out') ?? null,
      tzdbCheck: values.get('tzdb-check') ?? null,
    },
  };
}
