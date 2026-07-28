/**
 * Shared helpers for policy models. A unique local time fires exactly
 * once under every scheduler, so each model reuses this rather than
 * repeating the baseline case, and only spells out its own behavior
 * for the two hazard resolutions.
 */

import type { WallClockResolution } from '../../tz/index';
import type { PolicyOutcome, ResolvedFiring } from '../types';

/**
 * The universal baseline: a unique local time fires once at its
 * instant. Returns null for nonexistent and ambiguous resolutions, so
 * a model can fall through to its own hazard handling.
 */
export function baselineUnique(resolution: WallClockResolution): PolicyOutcome | null {
  return resolution.kind === 'unique' ? { kind: 'FIRES_ONCE_AT', instant: resolution.instant } : null;
}

/**
 * A decider for schedulers whose gap and fold behavior this project
 * has not verified and cannot ground in fetched documentation: unique
 * times fire once, both hazard resolutions are UNDEFINED. This is the
 * disciplined default, never a guess dressed up as a fact. Phase 6
 * replaces it where a real run confirms the branch.
 */
export function decideUndefinedAtHazards(firing: ResolvedFiring): PolicyOutcome {
  return baselineUnique(firing.resolution) ?? { kind: 'UNDEFINED' };
}
