/**
 * Types for the scheduler policy models. Each model answers one
 * question: given an intended firing that a zone made nonexistent or
 * ambiguous, what does this particular scheduler actually do? The
 * answer is a {@link PolicyOutcome}. A firing whose local time is
 * unique is not a decision point; every scheduler fires it once.
 *
 * Every model is tagged VERIFIED or ASSERTED. In this phase every
 * model is ASSERTED: phase 6 runs the real schedulers and only then
 * may flip specific models to VERIFIED. No model defaults to
 * VERIFIED, and ASSERTED is never presented as fact.
 */

import type { CronAst, LocalFiring } from '../cron/index';
import type { WallClockResolution } from '../tz/index';

/** Identifier of a modeled scheduler. */
export type PolicyId =
  | 'naive'
  | 'debian-cron'
  | 'cronie'
  | 'k8s-cronjob'
  | 'quartz'
  | 'croniter'
  | 'cronsim'
  | 'cron-parser-luxon'
  | 'node-cron'
  | 'systemd-timer'
  | 'github-actions';

/** Whether a model was confirmed against the real scheduler or asserted from docs. */
export type Verification = 'VERIFIED' | 'ASSERTED';

/**
 * What a scheduler does with one intended firing. FIRES_AT_CATCHUP is
 * distinct from FIRES_ONCE_AT only in intent (a compensating run
 * after a skipped slot); both name a single instant. UNDEFINED means
 * the model cannot say without observation, and must never be a
 * disguised guess.
 */
export type PolicyOutcome =
  | { kind: 'FIRES_ONCE_AT'; instant: number }
  | { kind: 'FIRES_TWICE_AT'; first: number; second: number }
  | { kind: 'DOES_NOT_FIRE' }
  | { kind: 'FIRES_AT_CATCHUP'; instant: number }
  | { kind: 'UNDEFINED' };

/** Tunable parameters that change a scheduler's behavior. */
export interface PolicyParams {
  /** Quartz misfire instruction; governs downtime catch-up, not DST resolution. */
  quartzMisfire?: 'smart-policy' | 'fire-once-now' | 'do-nothing';
  /** Kubernetes startingDeadlineSeconds; null or absent means unbounded. */
  k8sStartingDeadlineSeconds?: number | null;
  /** Kubernetes missed-schedule limit before the controller stops scheduling. */
  k8sMissedScheduleLimit?: number;
  /** systemd Persistent=; catches up runs missed while the system was off. */
  systemdPersistent?: boolean;
}

/** An intended firing paired with how its local time resolves in the zone. */
export interface ResolvedFiring {
  /** Intended local firing time. */
  local: LocalFiring;
  /** Resolution of that local time in the zone. */
  resolution: WallClockResolution;
}

/** A scheduler behavior model: a pure decision over one resolved firing. */
export interface PolicyModel {
  /** Scheduler identifier. */
  id: PolicyId;
  /** Decides the outcome for one firing under the given schedule and params. */
  decide: (firing: ResolvedFiring, ast: CronAst, params: PolicyParams) => PolicyOutcome;
}

/** The instants a policy outcome actually fires at (empty for none or undefined). */
export function outcomeInstants(outcome: PolicyOutcome): number[] {
  switch (outcome.kind) {
    case 'FIRES_ONCE_AT':
    case 'FIRES_AT_CATCHUP':
      return [outcome.instant];
    case 'FIRES_TWICE_AT':
      return [outcome.first, outcome.second];
    case 'DOES_NOT_FIRE':
    case 'UNDEFINED':
      return [];
  }
}
