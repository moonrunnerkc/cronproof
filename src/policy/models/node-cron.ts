/**
 * node-cron. Its README documents a "Timezones and DST" model,
 * fetched 2026-07-27 (https://github.com/node-cron/node-cron):
 * across a fall-back the repeated hour runs once, and across a
 * spring-forward the schedule pauses through the gap (the skipped
 * time does not fire). So a fold fires once at the first occurrence
 * and a gap does not fire.
 */

import type { PolicyModel, PolicyOutcome, ResolvedFiring } from '../types';

function decide(firing: ResolvedFiring): PolicyOutcome {
  const resolution = firing.resolution;
  switch (resolution.kind) {
    case 'unique':
      return { kind: 'FIRES_ONCE_AT', instant: resolution.instant };
    case 'nonexistent':
      return { kind: 'DOES_NOT_FIRE' };
    case 'ambiguous':
      return { kind: 'FIRES_ONCE_AT', instant: resolution.earlierInstant };
  }
}

/** The node-cron model. */
export const nodeCronModel: PolicyModel = { id: 'node-cron', decide };
