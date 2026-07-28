/**
 * k8s-cronjob. The CronJob controller computes schedule times in the
 * configured .spec.timeZone using robfig/cron, with no fall-back
 * suppression, so a repeated wall-clock time yields two scheduled
 * instants and the job fires twice. robfig/cron documents that "jobs
 * scheduled during daylight-savings leap-ahead transitions will not
 * be run" (https://pkg.go.dev/github.com/robfig/cron/v3, fetched
 * 2026-07-27), so a skipped time does not fire and is not caught up.
 *
 * startingDeadlineSeconds and the missed-schedule limit govern
 * catch-up of runs missed while the controller was down, which is
 * orthogonal to a DST gap or fold: a nonexistent local time has no
 * instant to have missed, so those parameters do not change the DST
 * outcome. They are modeled as functions for the controller-downtime
 * case rather than the DST case, and the DST decider does not use them.
 *
 * The missed-schedule limit is 100, verified in the controller source
 * (not the prose docs, which truncated on fetch). In the current v2
 * controller, more than 100 missed schedules records a warning event
 * but still schedules the most recent unmet time:
 * kubernetes/kubernetes v1.31.0 pkg/controller/cronjob/utils.go line
 * 172 (case numberOfMissedSchedules > 100) and line 220 (the
 * TooManyMissedTimes event), fetched 2026-07-28. The threshold is
 * unchanged from the old v1 controller, where >100 was instead a hard
 * error (FailedNeedsStart): kubernetes/kubernetes v1.20.0
 * pkg/controller/cronjob/utils.go line 147, fetched 2026-07-28.
 */

import type { PolicyModel, PolicyOutcome, PolicyParams, ResolvedFiring } from '../types';

/**
 * The missed-schedule count above which the CronJob controller records
 * a TooManyMissedTimes warning. Verified at kubernetes/kubernetes
 * v1.31.0 pkg/controller/cronjob/utils.go line 172.
 */
export const DEFAULT_K8S_MISSED_LIMIT = 100;

/**
 * Whether the controller would treat this many missed schedules as too
 * many (the >100 branch that records the TooManyMissedTimes warning).
 * Strictly greater than the limit, matching the source
 * `numberOfMissedSchedules > 100`. Exposed for the controller-downtime
 * case; the DST decider does not use it because a DST gap is not a
 * missed start.
 */
export function k8sTooManyMissedTimes(numberOfMissedSchedules: number): boolean {
  return numberOfMissedSchedules > DEFAULT_K8S_MISSED_LIMIT;
}

/**
 * Whether a run missed while the controller was down would still be
 * started, given startingDeadlineSeconds and how long ago it was
 * missed. Exposed for the controller-downtime case; the DST decider
 * does not use it because a DST gap is not a missed start.
 */
export function k8sWouldCatchUp(
  missedByMillis: number,
  params: PolicyParams,
): boolean {
  const deadline = params.k8sStartingDeadlineSeconds;
  if (deadline === undefined || deadline === null) {
    return true;
  }
  return missedByMillis <= deadline * 1000;
}

function decide(firing: ResolvedFiring): PolicyOutcome {
  const resolution = firing.resolution;
  switch (resolution.kind) {
    case 'unique':
      return { kind: 'FIRES_ONCE_AT', instant: resolution.instant };
    case 'nonexistent':
      return { kind: 'DOES_NOT_FIRE' };
    case 'ambiguous':
      return { kind: 'FIRES_TWICE_AT', first: resolution.earlierInstant, second: resolution.laterInstant };
  }
}

/** The k8s-cronjob model. */
export const k8sCronjobModel: PolicyModel = { id: 'k8s-cronjob', decide };
