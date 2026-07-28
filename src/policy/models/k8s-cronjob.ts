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
 * outcome. They are modeled as parameters (see k8sCatchUpWindow)
 * for the controller-downtime case rather than the DST case.
 * Kubernetes CronJob docs, fetched 2026-07-27:
 * https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
 */

import type { PolicyModel, PolicyOutcome, PolicyParams, ResolvedFiring } from '../types';

/** Default missed-schedule limit the controller stops scheduling after. */
export const DEFAULT_K8S_MISSED_LIMIT = 100;

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
