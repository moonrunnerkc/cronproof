/**
 * "Check my next transition" support. Given the visitor's zone and the
 * current instant, it finds the next offset transition and brackets it
 * with a wall-clock window (the day before through the day after), so
 * the playground can default the range to the change most likely to
 * bite the visitor's own schedules.
 */

import { civilFromDays, daysFromCivil, fieldsFromWallMillis } from '../../src/tz/civil-date';
import type { TzBackend, ZoneTransition } from '../../src/tz/types';
import type { LocalFiring } from '../../src/cron/index';

const YEAR_MILLIS = 365 * 86_400_000;

/** A transition and a wall-clock window that brackets it. */
export interface TransitionWindow {
  /** The next transition at or after the reference instant. */
  transition: ZoneTransition;
  /** Window start (day before the transition), naive wall-clock. */
  from: LocalFiring;
  /** Window end (day after the transition), naive wall-clock. */
  to: LocalFiring;
}

function midnight(year: number, month: number, day: number): LocalFiring {
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** Midnight `offset` days from a civil date, as wall-clock fields. */
function shiftDays(year: number, month: number, day: number, offset: number): LocalFiring {
  const date = civilFromDays(daysFromCivil(year, month, day) + offset);
  return midnight(date.year, date.month, date.day);
}

/**
 * Finds the next transition in `zone` at or after `nowMillis`, scanning
 * up to three years ahead, and brackets it with a two-day wall window.
 * Returns null when the zone has no transition in that horizon (for
 * example a zone whose DST was abolished).
 */
export function nextTransitionWindow(
  backend: TzBackend,
  zone: string,
  nowMillis: number,
): TransitionWindow | null {
  const transitions = backend.transitionsBetween(nowMillis, nowMillis + 3 * YEAR_MILLIS, zone);
  const transition = transitions[0];
  if (transition === undefined) {
    return null;
  }
  const wall = fieldsFromWallMillis(transition.instant + transition.offsetBeforeSeconds * 1000);
  return {
    transition,
    from: shiftDays(wall.year, wall.month, wall.day, -1),
    to: shiftDays(wall.year, wall.month, wall.day, 2),
  };
}
