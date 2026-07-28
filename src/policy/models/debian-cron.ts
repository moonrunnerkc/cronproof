/**
 * debian-cron. From cron(8) on Debian, fetched 2026-07-27
 * (https://manpages.debian.org/bookworm/cron/cron.8.en.html):
 *
 *   "Special considerations exist when the clock is changed by less
 *   than 3 hours [...] If the time has moved forwards, those jobs
 *   which would have run in the time that was skipped will be run
 *   soon after the change. Conversely, if the time has moved
 *   backwards by less than 3 hours, those jobs that fall into the
 *   repeated time will not be re-run. Only jobs that run at a
 *   particular time (not specified [...] with '*' in the hour or
 *   minute specifier) are affected. Jobs which are specified with
 *   wildcards are run based on the new time immediately. Clock
 *   changes of more than 3 hours [...] the new time is used
 *   immediately."
 *
 * So special handling requires a fixed-time job and a shift under
 * three hours. Forward: the skipped fixed-time job runs once just
 * after the jump (a catch-up). Backward: the fixed-time job in the
 * repeated hour runs once, not twice. Otherwise (wildcard job, or a
 * shift of three hours or more) there is no compensation and the job
 * behaves exactly as the naive wall-clock model.
 */

import type { CronAst } from '../../cron/index';
import { isFixedTime, shiftMagnitudeMillis, THREE_HOURS_MILLIS } from '../fixed-time';
import type { PolicyModel, PolicyOutcome, ResolvedFiring } from '../types';

function decide(firing: ResolvedFiring, ast: CronAst): PolicyOutcome {
  const resolution = firing.resolution;
  if (resolution.kind === 'unique') {
    return { kind: 'FIRES_ONCE_AT', instant: resolution.instant };
  }
  const special = isFixedTime(ast) && shiftMagnitudeMillis(resolution) < THREE_HOURS_MILLIS;
  if (resolution.kind === 'nonexistent') {
    return special
      ? { kind: 'FIRES_AT_CATCHUP', instant: resolution.transitionInstant }
      : { kind: 'DOES_NOT_FIRE' };
  }
  return special
    ? { kind: 'FIRES_ONCE_AT', instant: resolution.earlierInstant }
    : { kind: 'FIRES_TWICE_AT', first: resolution.earlierInstant, second: resolution.laterInstant };
}

/** The debian-cron model. */
export const debianCronModel: PolicyModel = { id: 'debian-cron', decide };
