/**
 * naive: pure wall-clock iteration with no DST awareness, the straw
 * model. It fires whenever the wall clock reads a matching time. A
 * skipped local time never appears on the clock, so it does not fire;
 * a repeated local time appears twice, so it fires twice. This is
 * what most hand-rolled schedulers actually do, which is why it is
 * worth modeling explicitly.
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
      return { kind: 'FIRES_TWICE_AT', first: resolution.earlierInstant, second: resolution.laterInstant };
  }
}

/** The naive model. */
export const naiveModel: PolicyModel = { id: 'naive', decide };
