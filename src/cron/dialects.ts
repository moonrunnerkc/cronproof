/**
 * Per-dialect configuration for the standard (field-based) cron
 * dialects. systemd OnCalendar is a separate grammar and is not
 * described here. Each spec fixes the field layout, the special
 * tokens allowed in the two day fields, and the two combination
 * rules that decide how day-of-month and day-of-week interact.
 *
 * Sources fetched 2026-07-27 and recorded in DECISIONS.md:
 * crontab(5) man page (Vixie OR quirk, 0 and 7 Sunday), robfig/cron
 * v3 docs (k8s parser), Quartz CronTrigger docs (L W # ?, 1 to 7),
 * AWS EventBridge Scheduler docs (6 fields with year, ? rule),
 * GitHub Actions workflow docs (5 fields, no nonstandard tokens).
 */

import type { DomOptions, DowOptions } from './field-day';
import type { DialectId } from './types';

/** Whether a year field is absent, required, or optional (trailing). */
export type YearPresence = 'no' | 'required' | 'optional';

/** Complete configuration of one standard cron dialect. */
export interface DialectSpec {
  /** Dialect identifier. */
  id: DialectId;
  /** True when a seconds field leads the expression. */
  seconds: boolean;
  /** Whether a trailing year field is present. */
  year: YearPresence;
  /** True when @-macros expand in this dialect. */
  allowMacros: boolean;
  /** Special-token permissions for the day-of-month field. */
  dom: DomOptions;
  /** Numbering and special-token permissions for the day-of-week field. */
  dow: DowOptions;
  /**
   * True when day-of-month and day-of-week are OR'd once both are
   * restricted (the Vixie quirk). False for dialects that instead
   * force one of the two to be "?" (Quartz, AWS).
   */
  orQuirk: boolean;
  /**
   * True when at least one of day-of-month or day-of-week must be
   * "?" (Quartz and AWS EventBridge).
   */
  requireQuestionMark: boolean;
  /** True when this dialect is always evaluated in UTC. */
  utcOnly: boolean;
}

function dom(dialectName: string, allow: { q: boolean; l: boolean; w: boolean }): DomOptions {
  return {
    dialectName,
    allowQuestionMark: allow.q,
    allowL: allow.l,
    allowW: allow.w,
  };
}

function dow(
  dialectName: string,
  numbering: 'vixie' | 'quartz',
  allow: { q: boolean; l: boolean; hash: boolean },
): DowOptions {
  return {
    dialectName,
    numbering,
    allowQuestionMark: allow.q,
    allowL: allow.l,
    allowHash: allow.hash,
  };
}

const NONE = { q: false, l: false, w: false };
const NONE_DOW = { q: false, l: false, hash: false };
const ALL_DOM = { q: true, l: true, w: true };

const SPECS: Record<Exclude<DialectId, 'systemd'>, DialectSpec> = {
  vixie: {
    id: 'vixie',
    seconds: false,
    year: 'no',
    allowMacros: true,
    dom: dom('vixie', NONE),
    dow: dow('vixie', 'vixie', NONE_DOW),
    orQuirk: true,
    requireQuestionMark: false,
    utcOnly: false,
  },
  debian: {
    id: 'debian',
    seconds: false,
    year: 'no',
    allowMacros: true,
    dom: dom('debian', NONE),
    dow: dow('debian', 'vixie', NONE_DOW),
    orQuirk: true,
    requireQuestionMark: false,
    utcOnly: false,
  },
  k8s: {
    id: 'k8s',
    seconds: false,
    year: 'no',
    allowMacros: true,
    dom: dom('k8s', { q: true, l: false, w: false }),
    dow: dow('k8s', 'vixie', { q: true, l: false, hash: false }),
    orQuirk: true,
    requireQuestionMark: false,
    utcOnly: false,
  },
  quartz: {
    id: 'quartz',
    seconds: true,
    year: 'optional',
    allowMacros: false,
    dom: dom('quartz', ALL_DOM),
    dow: dow('quartz', 'quartz', { q: true, l: true, hash: true }),
    orQuirk: false,
    requireQuestionMark: true,
    utcOnly: false,
  },
  'aws-eventbridge': {
    id: 'aws-eventbridge',
    seconds: false,
    year: 'required',
    allowMacros: false,
    dom: dom('aws-eventbridge', { q: true, l: true, w: true }),
    dow: dow('aws-eventbridge', 'quartz', { q: true, l: true, hash: true }),
    orQuirk: false,
    requireQuestionMark: true,
    utcOnly: false,
  },
  'github-actions': {
    id: 'github-actions',
    seconds: false,
    year: 'no',
    allowMacros: false,
    dom: dom('github-actions', NONE),
    dow: dow('github-actions', 'vixie', NONE_DOW),
    orQuirk: true,
    requireQuestionMark: false,
    utcOnly: true,
  },
};

/** Returns the spec for a standard cron dialect, or null for systemd. */
export function dialectSpec(id: DialectId): DialectSpec | null {
  return id === 'systemd' ? null : SPECS[id];
}

/** Token counts this dialect accepts, smallest first. */
export function acceptedFieldCounts(spec: DialectSpec): number[] {
  const base = 5 + (spec.seconds ? 1 : 0);
  if (spec.year === 'no') {
    return [base];
  }
  if (spec.year === 'required') {
    return [base + 1];
  }
  return [base, base + 1];
}
