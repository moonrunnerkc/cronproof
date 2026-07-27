/**
 * INTERVAL_DRIFT for interval-like schedules (a wildcard or step
 * minute field firing several times an hour). Such a schedule neither
 * skips nor doubles a distinct job; instead its real inter-firing
 * interval stretches across a transition. Each transition that the
 * schedule fires around produces one drift hazard.
 *
 * The nominal cadence is the modal spacing between consecutive
 * firings away from a transition. Across a transition of magnitude D,
 * the affected interval grows to cadence plus |D|: on spring-forward
 * this is the wall-clock gap with no firing, on fall-back it is the
 * real-time gap between the last pre-transition firing and the first
 * post-transition firing. See DECISIONS.md, phase 4.
 */

import { wallMillisFromFields, type TzBackend } from '../tz/index';
import type { DialectId, LocalFiring } from '../cron/index';
import { makeHazard } from './build-hazard';
import { windowTransitions } from './transitions';
import type { Hazard } from './types';

const THREE_HOURS_MILLIS = 3 * 3_600_000;

/** Modal positive spacing between consecutive firings, or null. */
function nominalCadence(wallMillis: number[]): number | null {
  if (wallMillis.length < 2) {
    return null;
  }
  const counts = new Map<number, number>();
  for (let i = 1; i < wallMillis.length; i += 1) {
    const diff = (wallMillis[i] ?? 0) - (wallMillis[i - 1] ?? 0);
    if (diff > 0) {
      counts.set(diff, (counts.get(diff) ?? 0) + 1);
    }
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [diff, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && diff < best)) {
      best = diff;
      bestCount = count;
    }
  }
  return best;
}

interface Bracket {
  before: LocalFiring;
  after: LocalFiring;
}

/**
 * The last firing before and first firing after the transition's
 * affected wall band [loWall, hiWall). For a spring-forward gap the
 * band is the skipped hour, so the bracket is the last firing before
 * the gap and the first after it; for a fall-back fold the band is
 * the repeated hour. Both sides must be within three hours of the
 * band, else the schedule does not fire around this transition.
 */
function bracketFirings(
  firings: LocalFiring[],
  wallMillis: number[],
  loWall: number,
  hiWall: number,
): Bracket | null {
  let before: LocalFiring | null = null;
  let beforeWall = -Infinity;
  let after: LocalFiring | null = null;
  let afterWall = Infinity;
  for (let i = 0; i < firings.length; i += 1) {
    const wall = wallMillis[i] ?? 0;
    const firing = firings[i];
    if (firing === undefined) {
      continue;
    }
    if (wall < loWall && wall > beforeWall) {
      before = firing;
      beforeWall = wall;
    }
    if (wall >= hiWall && wall < afterWall) {
      after = firing;
      afterWall = wall;
    }
  }
  if (before === null || after === null) {
    return null;
  }
  if (loWall - beforeWall > THREE_HOURS_MILLIS || afterWall - hiWall > THREE_HOURS_MILLIS) {
    return null;
  }
  return { before, after };
}

/** Emits one INTERVAL_DRIFT per transition the schedule fires around. */
export function intervalDriftHazards(
  firings: LocalFiring[],
  expression: string,
  dialect: DialectId,
  zone: string,
  from: LocalFiring,
  to: LocalFiring,
  backend: TzBackend,
  idempotent: boolean,
): Hazard[] {
  const wallMillis = firings.map((firing) => wallMillisFromFields(firing));
  const cadence = nominalCadence(wallMillis);
  if (cadence === null) {
    return [];
  }
  const hazards: Hazard[] = [];
  for (const transition of windowTransitions(backend, zone, from, to)) {
    const boundaryA = transition.instant + transition.offsetBeforeSeconds * 1000;
    const boundaryB = transition.instant + transition.offsetAfterSeconds * 1000;
    const loWall = Math.min(boundaryA, boundaryB);
    const hiWall = Math.max(boundaryA, boundaryB);
    const bracket = bracketFirings(firings, wallMillis, loWall, hiWall);
    if (bracket === null) {
      continue;
    }
    hazards.push(
      makeHazard({
        kind: 'INTERVAL_DRIFT',
        expression,
        dialect,
        zone,
        intendedLocal: bracket.before,
        instants: [],
        causingTransition: {
          instant: transition.instant,
          offsetBeforeSeconds: transition.offsetBeforeSeconds,
          offsetAfterSeconds: transition.offsetAfterSeconds,
          deltaSeconds: transition.deltaSeconds,
        },
        idempotent,
        detail: {
          kind: 'INTERVAL_DRIFT',
          drift: {
            expectedIntervalMillis: cadence,
            actualIntervalMillis: cadence + Math.abs(transition.deltaSeconds) * 1000,
            before: bracket.before,
            after: bracket.after,
          },
        },
      }),
    );
  }
  return hazards;
}
