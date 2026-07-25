/**
 * Resolves a local wall-clock reading in a zone to a three-way
 * discriminated union: UNIQUE (one instant), NONEXISTENT (skipped by
 * a forward transition), or AMBIGUOUS (repeated by a backward
 * transition). The union is the product: no code path yields an
 * instant without forcing the caller to handle which case occurred.
 *
 * The resolution uses offsets and transitions only. The isDst flag
 * plays no role, so negative-DST zones (Europe/Dublin) resolve
 * correctly.
 */

import { DAY_MILLIS, daysInMonth, wallMillisFromFields } from './civil-date';
import { createTzifBackend } from './tzif-backend';
import type {
  LocalWallFields,
  TzBackend,
  WallClockResolution,
  ZoneTransition,
} from './types';

const WINDOW_MILLIS = 2 * DAY_MILLIS;

let defaultBackend: TzBackend | null = null;

function fallbackBackend(): TzBackend {
  if (defaultBackend === null) {
    defaultBackend = createTzifBackend();
  }
  return defaultBackend;
}

function validateFields(fields: LocalWallFields): void {
  const checks: [string, number, number, number][] = [
    ['month', fields.month, 1, 12],
    ['day', fields.day, 1, daysInMonth(fields.year, fields.month)],
    ['hour', fields.hour, 0, 23],
    ['minute', fields.minute, 0, 59],
    ['second', fields.second ?? 0, 0, 59],
    ['millisecond', fields.millisecond ?? 0, 0, 999],
  ];
  for (const [name, value, min, max] of checks) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${name} out of range: ${value}`);
    }
  }
}

interface Segment {
  startUtcMillis: number;
  endUtcMillis: number;
  offsetSeconds: number;
}

function segmentsAround(
  backend: TzBackend,
  zone: string,
  windowStart: number,
  windowEnd: number,
  transitions: ZoneTransition[],
): Segment[] {
  const segments: Segment[] = [];
  let cursor = windowStart;
  let offset = backend.offsetAt(windowStart, zone).offsetSeconds;
  for (const transition of transitions) {
    segments.push({ startUtcMillis: cursor, endUtcMillis: transition.instant, offsetSeconds: offset });
    cursor = transition.instant;
    offset = transition.offsetAfterSeconds;
  }
  segments.push({ startUtcMillis: cursor, endUtcMillis: windowEnd, offsetSeconds: offset });
  return segments;
}

/**
 * Resolves local wall-clock fields in an IANA zone. Uses the given
 * backend, defaulting to a shared TZif backend. Throws RangeError on
 * out-of-range fields and propagates backend errors for unknown
 * zones.
 */
export function resolveWallClock(
  fields: LocalWallFields,
  zone: string,
  backend: TzBackend = fallbackBackend(),
): WallClockResolution {
  validateFields(fields);
  const wall = wallMillisFromFields(fields);
  const windowStart = wall - WINDOW_MILLIS;
  const windowEnd = wall + WINDOW_MILLIS;
  const transitions = backend.transitionsBetween(windowStart, windowEnd, zone);
  const segments = segmentsAround(backend, zone, windowStart, windowEnd, transitions);

  const candidates: { instant: number; offsetSeconds: number }[] = [];
  for (const segment of segments) {
    const instant = wall - segment.offsetSeconds * 1000;
    if (instant >= segment.startUtcMillis && instant < segment.endUtcMillis) {
      candidates.push({ instant, offsetSeconds: segment.offsetSeconds });
    }
  }
  candidates.sort((a, b) => a.instant - b.instant);

  if (candidates.length === 1) {
    const only = candidates[0];
    if (only === undefined) {
      throw new Error('unreachable: candidate list of length 1 is empty');
    }
    return { kind: 'unique', instant: only.instant, offsetSeconds: only.offsetSeconds };
  }

  if (candidates.length === 0) {
    for (const transition of transitions) {
      const gapStartWallMillis = transition.instant + transition.offsetBeforeSeconds * 1000;
      const gapEndWallMillis = transition.instant + transition.offsetAfterSeconds * 1000;
      if (
        transition.deltaSeconds > 0 &&
        wall >= gapStartWallMillis &&
        wall < gapEndWallMillis
      ) {
        return {
          kind: 'nonexistent',
          transitionInstant: transition.instant,
          gapStartWallMillis,
          gapEndWallMillis,
          gapDurationMilliseconds: transition.deltaSeconds * 1000,
        };
      }
    }
    throw new Error(
      `no candidate instant and no covering gap for ${zone}; backend transitions inconsistent`,
    );
  }

  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('unreachable: multi-candidate list has no endpoints');
  }
  return {
    kind: 'ambiguous',
    candidateInstants: candidates.map((c) => c.instant),
    earlierInstant: first.instant,
    laterInstant: last.instant,
    foldDurationMilliseconds: (first.offsetSeconds - last.offsetSeconds) * 1000,
  };
}
