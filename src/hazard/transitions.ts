/**
 * Helpers for locating offset transitions relevant to a hazard. All
 * timezone access for the hazard classifier funnels through here.
 */

import { wallMillisFromFields, type TzBackend, type ZoneTransition } from '../tz/index';
import type { LocalFiring } from '../cron/index';
import type { CausingTransition } from './types';

const DAY_MILLIS = 86_400_000;

function toCausing(transition: ZoneTransition): CausingTransition {
  return {
    instant: transition.instant,
    offsetBeforeSeconds: transition.offsetBeforeSeconds,
    offsetAfterSeconds: transition.offsetAfterSeconds,
    deltaSeconds: transition.deltaSeconds,
  };
}

/**
 * The transition active at an exact instant, or null. Transitions are
 * half-open [start, next), so a transition whose instant equals the
 * query is returned by a one-millisecond window.
 */
export function transitionAtInstant(
  backend: TzBackend,
  zone: string,
  instant: number,
): CausingTransition | null {
  const found = backend.transitionsBetween(instant, instant + 1, zone);
  const first = found[0];
  return first === undefined ? null : toCausing(first);
}

/**
 * The backward transition responsible for an ambiguous (folded) local
 * time, searched between the two candidate instants.
 */
export function foldTransition(
  backend: TzBackend,
  zone: string,
  earlierInstant: number,
  laterInstant: number,
): CausingTransition | null {
  const found = backend.transitionsBetween(earlierInstant, laterInstant + 1, zone);
  for (const transition of found) {
    if (transition.deltaSeconds < 0) {
      return toCausing(transition);
    }
  }
  return null;
}

/**
 * All transitions whose instant could fall inside the wall window
 * [from, to], padded so a transition near either edge is included.
 * The wall bounds are used as approximate UTC bounds; the padding of
 * two days covers the largest real offset.
 */
export function windowTransitions(
  backend: TzBackend,
  zone: string,
  from: LocalFiring,
  to: LocalFiring,
): ZoneTransition[] {
  const start = wallMillisFromFields(from) - 2 * DAY_MILLIS;
  const end = wallMillisFromFields(to) + 2 * DAY_MILLIS;
  return backend.transitionsBetween(start, end, zone);
}
