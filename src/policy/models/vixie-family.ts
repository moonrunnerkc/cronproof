/**
 * The DST decision shared by the Vixie-derived cron daemons, debian
 * cron and cronie. Phase 6 ran both across both transitions in
 * Europe/Berlin and America/New_York and they behaved identically, so
 * they share one decider (fixtures debian-cron.json and cronie.json).
 *
 * The rule is Debian cron(8): special handling applies only to a
 * fixed-time job (neither minute nor hour begins with an asterisk)
 * and a shift under three hours. A skipped fixed-time job runs once
 * just after the jump, at the transition instant; a folded fixed-time
 * job runs once, at the first occurrence. Otherwise (an interval job,
 * or a shift of three hours or more) there is no compensation: a
 * folded slot fires twice and a skipped slot does not fire.
 */

import type { CronAst } from '../../cron/index';
import { isFixedTime, shiftMagnitudeMillis, THREE_HOURS_MILLIS } from '../fixed-time';
import type { PolicyOutcome, ResolvedFiring } from '../types';

/** Decides one firing under the Vixie-family DST rule. */
export function vixieFamilyDecide(firing: ResolvedFiring, ast: CronAst): PolicyOutcome {
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
