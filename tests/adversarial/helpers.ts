/**
 * Shared setup for the adversarial-zone suites. Each adversarial test
 * asserts one zone's specific weirdness against the vendored TZif data,
 * so all suites read from one backend built on the vendored 2025b root.
 */

import { parse } from '../../src/cron/index';
import type { DialectId, LocalFiring } from '../../src/cron/index';
import { classifyHazards } from '../../src/hazard/index';
import type { Hazard } from '../../src/hazard/index';
import {
  createTzifBackend,
  resolveWallClock,
  vendoredZoneinfoRoot,
  type TzifBackend,
  type WallClockResolution,
  type ZoneTransition,
} from '../../src/tz/index';

const found = vendoredZoneinfoRoot();
if (found === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}

/** The vendored zoneinfo root, guaranteed non-null. */
export const ROOT: string = found;

/** One shared TZif backend over the vendored data. */
export const backend: TzifBackend = createTzifBackend({ zoneinfoRoot: ROOT });

/** UTC millis for a civil UTC datetime, hour and minute optional. */
export function utc(year: number, month1: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month1 - 1, day, hour, minute);
}

/** UTC offset in seconds in effect at a UTC instant in a zone. */
export function offsetSecondsAt(zone: string, instant: number): number {
  return backend.offsetAt(instant, zone).offsetSeconds;
}

/** Every transition in [start, end) for a zone. */
export function transitionsIn(zone: string, start: number, end: number): ZoneTransition[] {
  return backend.transitionsBetween(start, end, zone);
}

/** Resolves a naive wall-clock reading in a zone. */
export function resolve(local: LocalFiring, zone: string): WallClockResolution {
  return resolveWallClock(local, zone, backend);
}

/** Midnight wall-clock fields for a civil date. */
export function midnight(year: number, month: number, day: number): LocalFiring {
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** Classifies a vixie expression in a zone over [fromYear, toYear). */
export function classify(
  expression: string,
  zone: string,
  fromYear: number,
  toYear: number,
  dialect: DialectId = 'vixie',
): Hazard[] {
  const parsed = parse(expression, dialect);
  if (!parsed.ok) {
    throw new Error(`parse failed for "${expression}": ${JSON.stringify(parsed.errors)}`);
  }
  return classifyHazards(parsed.ast, backend, {
    expression,
    dialect,
    zone,
    from: midnight(fromYear, 1, 1),
    to: midnight(toYear, 1, 1),
    zoneinfoRoot: ROOT,
  });
}
