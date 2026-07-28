/**
 * A data-driven decider for the libraries whose DST behavior phase 6
 * observed directly. Each library reduces to a profile: what it does
 * with a folded (ambiguous) local time and a skipped (nonexistent)
 * one, split by whether the schedule is a fixed daily time or an
 * interval, because the cursor-based libraries fire a folded interval
 * slot twice but a lone daily job only once. The instants come from
 * the resolution, so a verified profile reproduces the observed fire
 * sequence exactly.
 */

import { wallMillisFromFields } from '../../tz/index';
import { isFixedTime } from '../fixed-time';
import type { CronAst } from '../../cron/index';
import type { PolicyOutcome, ResolvedFiring } from '../types';

/** Outcome template names a profile can select for a hazard. */
export type OutcomeTemplate =
  | 'twice'
  | 'once-earlier'
  | 'does-not-fire'
  | 'once-at-transition'
  | 'once-shifted-forward';

/** How a library behaves at a fold and a gap, split by schedule shape. */
export interface LibraryDstProfile {
  /** Ambiguous (fold) outcome for a fixed daily time. */
  ambiguousFixed: OutcomeTemplate;
  /** Ambiguous (fold) outcome for an interval schedule. */
  ambiguousInterval: OutcomeTemplate;
  /** Nonexistent (gap) outcome for a fixed daily time. */
  nonexistentFixed: OutcomeTemplate;
  /** Nonexistent (gap) outcome for an interval schedule. */
  nonexistentInterval: OutcomeTemplate;
}

function applyTemplate(
  template: OutcomeTemplate,
  firing: ResolvedFiring,
): PolicyOutcome {
  const resolution = firing.resolution;
  if (resolution.kind === 'ambiguous') {
    switch (template) {
      case 'twice':
        return { kind: 'FIRES_TWICE_AT', first: resolution.earlierInstant, second: resolution.laterInstant };
      case 'once-earlier':
        return { kind: 'FIRES_ONCE_AT', instant: resolution.earlierInstant };
      case 'does-not-fire':
        return { kind: 'DOES_NOT_FIRE' };
      default:
        return { kind: 'UNDEFINED' };
    }
  }
  if (resolution.kind === 'nonexistent') {
    switch (template) {
      case 'does-not-fire':
        return { kind: 'DOES_NOT_FIRE' };
      case 'once-at-transition':
        return { kind: 'FIRES_ONCE_AT', instant: resolution.transitionInstant };
      case 'once-shifted-forward': {
        const shift = wallMillisFromFields(firing.local) - resolution.gapStartWallMillis;
        return { kind: 'FIRES_ONCE_AT', instant: resolution.transitionInstant + shift };
      }
      default:
        return { kind: 'UNDEFINED' };
    }
  }
  return { kind: 'FIRES_ONCE_AT', instant: resolution.instant };
}

/** Builds a decider from a library DST profile. */
export function profileDecider(
  profile: LibraryDstProfile,
): (firing: ResolvedFiring, ast: CronAst) => PolicyOutcome {
  return (firing, ast) => {
    const resolution = firing.resolution;
    if (resolution.kind === 'unique') {
      return { kind: 'FIRES_ONCE_AT', instant: resolution.instant };
    }
    const fixed = isFixedTime(ast);
    if (resolution.kind === 'ambiguous') {
      return applyTemplate(fixed ? profile.ambiguousFixed : profile.ambiguousInterval, firing);
    }
    return applyTemplate(fixed ? profile.nonexistentFixed : profile.nonexistentInterval, firing);
  };
}
