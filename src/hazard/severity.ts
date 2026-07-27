/**
 * Severity assignment for hazards. The reasoning behind the ordering
 * is recorded in DECISIONS.md; the short version is that a double run
 * of non-idempotent work corrupts state, while a skip usually only
 * delays, so DOUBLED on non-idempotent work outranks SKIPPED.
 * Idempotence cannot be read off a cron line, so it is an explicit
 * per-schedule flag defaulting to false (doubles treated as severe).
 */

import type { HazardKind, Severity } from './types';

const RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Numeric rank of a severity, higher being more severe. */
export function severityRank(severity: Severity): number {
  return RANK[severity];
}

/**
 * Assigns severity from the hazard kind and whether the scheduled
 * work is idempotent.
 *
 * - DOUBLED: critical when not idempotent (a duplicate run can
 *   corrupt state), low when idempotent (the duplicate is harmless).
 * - SKIPPED: high. A missed run is serious but usually recoverable by
 *   a delayed or manual run, and it never corrupts state.
 * - COUNT_ANOMALY: high. A calendar day that does not exist means a
 *   daily job silently never runs that day, which is easy to miss.
 * - INTERVAL_DRIFT: medium. Cadence stretches or compresses across
 *   the transition but no single run is lost or duplicated.
 * - ZONE_UNSTABLE: info. Not a fault, a label: the region is a
 *   prediction from POSIX extrapolation, not a recorded fact.
 */
export function severityFor(kind: HazardKind, idempotent: boolean): Severity {
  switch (kind) {
    case 'DOUBLED':
      return idempotent ? 'low' : 'critical';
    case 'SKIPPED':
      return 'high';
    case 'COUNT_ANOMALY':
      return 'high';
    case 'INTERVAL_DRIFT':
      return 'medium';
    case 'ZONE_UNSTABLE':
      return 'info';
  }
}
