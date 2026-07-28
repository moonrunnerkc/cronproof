/**
 * The playground input state and its conversions. State is a plain
 * record of the six inputs a verdict needs; it is what the permalink
 * encodes and what the analysis consumes. Date parsing mirrors the
 * CLI's grammar (YYYY-MM-DD or YYYY-MM-DDTHH:MM) so a web verdict and a
 * CLI verdict start from identical wall-clock bounds.
 */

import type { DialectId, LocalFiring } from '../../src/cron/index';

/** The supported dialects, in the order the selector lists them. */
export const DIALECTS: readonly DialectId[] = [
  'vixie',
  'debian',
  'quartz',
  'k8s',
  'systemd',
  'github-actions',
  'aws-eventbridge',
];

/** The six inputs that define a verdict. */
export interface PlaygroundState {
  /** Source cron or OnCalendar expression. */
  expression: string;
  /** Dialect to parse under. */
  dialect: DialectId;
  /** IANA zone to evaluate in. */
  zone: string;
  /** Inclusive window start, YYYY-MM-DD or YYYY-MM-DDTHH:MM. */
  from: string;
  /** Exclusive window end, same grammar. */
  to: string;
  /** Whether a double execution is harmless. */
  idempotent: boolean;
}

/** The default state shown on a cold load with no permalink. */
export function defaultState(): PlaygroundState {
  return {
    expression: '30 2 * * *',
    dialect: 'vixie',
    zone: 'America/New_York',
    from: '2024-01-01',
    to: '2025-01-01',
    idempotent: false,
  };
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parses a date string into naive wall-clock fields, or returns null
 * when it matches neither accepted form. Identical grammar to the CLI.
 */
export function parseDateString(text: string): LocalFiring | null {
  const match = DATE_ONLY.exec(text) ?? DATE_TIME.exec(text);
  if (match === null) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
  };
}

/** Whether a string names a dialect the playground supports. */
export function isDialect(value: string): value is DialectId {
  return (DIALECTS as readonly string[]).includes(value);
}
