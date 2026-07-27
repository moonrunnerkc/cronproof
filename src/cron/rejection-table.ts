/**
 * A fixed table of cron expressions, each accepted by at least one
 * dialect and rejected by at least one other, with the expected
 * rejection reason. This is shared by the dialect-rejection test and
 * by the evidence script that prints the table, so the two can never
 * drift apart. Every reason substring here is asserted against the
 * real validator output, not hand-written prose.
 */

import type { DialectId } from './types';

/** One row: an expression and the dialect it is checked against. */
export interface RejectionCase {
  /** The cron or OnCalendar expression under test. */
  expression: string;
  /** Dialect the expression is evaluated under. */
  dialect: DialectId;
  /** True when this dialect must accept the expression. */
  accepted: boolean;
  /** Substring the first rejection reason must contain (rejections only). */
  reasonIncludes?: string;
  /** What this row demonstrates. */
  note: string;
}

export const REJECTION_CASES: RejectionCase[] = [
  {
    expression: '0 0 0 1 1 ?',
    dialect: 'vixie',
    accepted: false,
    reasonIncludes: 'expects 5 fields',
    note: 'Vixie is 5-field; a seconds field is rejected',
  },
  {
    expression: '0 0 1 1 ?',
    dialect: 'debian',
    accepted: false,
    reasonIncludes: '"?" is not supported',
    note: 'Debian (Vixie extensions) has no "?" placeholder',
  },
  {
    expression: '0 0 1 1 ?',
    dialect: 'k8s',
    accepted: true,
    note: 'robfig/cron (k8s) accepts "?" as a blank day placeholder',
  },
  {
    expression: '0 0 L * ?',
    dialect: 'k8s',
    accepted: false,
    reasonIncludes: '"L" is not supported',
    note: 'the robfig standard parser has no "L" token',
  },
  {
    expression: '0 0 0 ? * MON#5',
    dialect: 'k8s',
    accepted: false,
    reasonIncludes: 'expects 5 fields',
    note: 'the k8s parser is 5-field; the Quartz 6-field form is rejected',
  },
  {
    expression: '* * * * *',
    dialect: 'quartz',
    accepted: false,
    reasonIncludes: 'expects 6 or 7 fields',
    note: 'Quartz needs a seconds field (6 or 7 fields total)',
  },
  {
    expression: '0 0 0 * * *',
    dialect: 'quartz',
    accepted: false,
    reasonIncludes: 'requires "?"',
    note: 'Quartz forbids restricting day-of-month and day-of-week together',
  },
  {
    expression: '0 0 0 ? * MON#5',
    dialect: 'quartz',
    accepted: true,
    note: 'Quartz accepts the "#" nth-weekday token',
  },
  {
    expression: '0 0 * 2 MON#5',
    dialect: 'vixie',
    accepted: false,
    reasonIncludes: '"#" is not supported',
    note: 'Vixie has no "#" token',
  },
  {
    expression: '* * * * *',
    dialect: 'aws-eventbridge',
    accepted: false,
    reasonIncludes: 'expects 6 fields',
    note: 'AWS EventBridge is 6-field; the 5-field POSIX form is rejected',
  },
  {
    expression: '0 10 * * * *',
    dialect: 'aws-eventbridge',
    accepted: false,
    reasonIncludes: 'requires "?"',
    note: 'AWS EventBridge forbids "*" in both day fields at once',
  },
  {
    expression: '0 10 * * ? *',
    dialect: 'aws-eventbridge',
    accepted: true,
    note: 'AWS EventBridge accepts the 6-field form with "?" in day-of-week',
  },
  {
    expression: '0 0 1 1 ?',
    dialect: 'github-actions',
    accepted: false,
    reasonIncludes: '"?" is not supported',
    note: 'GitHub Actions cron is the POSIX 5-field subset with no "?"',
  },
  {
    expression: '30 5 * * 1-5',
    dialect: 'github-actions',
    accepted: true,
    note: 'GitHub Actions accepts a plain weekday range',
  },
  {
    expression: '*/5 * * * *',
    dialect: 'systemd',
    accepted: false,
    reasonIncludes: 'cannot classify',
    note: 'a classic cron expression is not valid OnCalendar syntax',
  },
  {
    expression: 'Mon..Fri *-*-* 09:30:00',
    dialect: 'systemd',
    accepted: true,
    note: 'systemd accepts the OnCalendar weekday-date-time form',
  },
  {
    expression: '@yearly',
    dialect: 'quartz',
    accepted: false,
    reasonIncludes: 'does not support @-macros',
    note: 'Quartz has no @-macros',
  },
  {
    expression: '@yearly',
    dialect: 'vixie',
    accepted: true,
    note: 'Vixie accepts @yearly',
  },
];
