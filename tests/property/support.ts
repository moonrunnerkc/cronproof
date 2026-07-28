/**
 * Shared arbitraries and helpers for the fast-check property suites.
 * Generators build only syntactically valid vixie cron expressions and
 * day-aligned wall-clock windows, so a property never has to discard a
 * malformed input. Zone lists and small calendar helpers live here too
 * so every property file draws from the same corpus.
 */

import fc from 'fast-check';
import { civilFromDays, daysFromCivil } from '../../src/tz/index';
import type { LocalFiring } from '../../src/cron/index';

/**
 * Zones with real, hazard-producing offset transitions in the modern
 * window. Property suites that need skips, doubles, and drift to
 * actually occur draw zones from here rather than from the full IANA
 * set, where most zones are quiet.
 */
export const HAZARD_ZONES: readonly string[] = [
  'America/New_York',
  'Europe/Dublin',
  'Australia/Lord_Howe',
  'Pacific/Chatham',
  'Antarctica/Troll',
  'Africa/Casablanca',
  'Asia/Gaza',
  'America/Santiago',
  'Europe/Lisbon',
  'Europe/London',
  'America/Sao_Paulo',
  'Pacific/Auckland',
];

/**
 * Filters a candidate zone list to those the Intl backend accepts on
 * this runtime, so a backend-agreement property never fails on a zone
 * that one backend cannot name. The predicate is the caller's, keyed
 * off a probe instant.
 */
export function acceptedZones(zones: string[], accepts: (zone: string) => boolean): string[] {
  return zones.filter((zone) => accepts(zone));
}

/** A single cron field, as one of the valid source forms in [min, max]. */
function cronFieldArb(min: number, max: number): fc.Arbitrary<string> {
  const span = max - min;
  const stepMax = Math.max(2, Math.floor(span / 2));
  const range = fc
    .tuple(fc.integer({ min, max }), fc.integer({ min, max }))
    .map(([a, b]): [number, number] => (a <= b ? [a, b] : [b, a]));
  return fc.oneof(
    fc.constant('*'),
    fc.integer({ min, max }).map(String),
    fc.integer({ min: 1, max: stepMax }).map((step) => `*/${step}`),
    range.map(([lo, hi]) => `${lo}-${hi}`),
    range.chain(([lo, hi]) =>
      fc.integer({ min: 1, max: Math.max(1, hi - lo) }).map((step) => `${lo}-${hi}/${step}`),
    ),
    fc.array(fc.integer({ min, max }), { minLength: 2, maxLength: 3 }).map((vals) => vals.join(',')),
  );
}

/**
 * A syntactically valid five-field vixie cron expression. Every field
 * stays inside its domain, so the parser accepts every generated
 * value.
 */
export function cronExpressionArb(): fc.Arbitrary<string> {
  return fc
    .tuple(
      cronFieldArb(0, 59),
      cronFieldArb(0, 23),
      cronFieldArb(1, 31),
      cronFieldArb(1, 12),
      cronFieldArb(0, 6),
    )
    .map((fields) => fields.join(' '));
}

/** Midnight wall-clock fields for a civil date. */
export function midnight(year: number, month: number, day: number): LocalFiring {
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** Returns the midnight wall-clock fields `days` after a midnight. */
export function addDays(from: LocalFiring, days: number): LocalFiring {
  const date = civilFromDays(daysFromCivil(from.year, from.month, from.day) + days);
  return midnight(date.year, date.month, date.day);
}

/**
 * A day-aligned window inside 2024 through 2026, returned as
 * [from, to) midnights spanning between one and `maxSpanDays` days.
 * Bounded so a per-firing property stays fast even for a wildcard
 * minute field.
 */
export function windowArb(maxSpanDays: number): fc.Arbitrary<{ from: LocalFiring; to: LocalFiring }> {
  const base = daysFromCivil(2024, 1, 1);
  const horizon = daysFromCivil(2026, 12, 1);
  return fc
    .tuple(
      fc.integer({ min: base, max: horizon }),
      fc.integer({ min: 1, max: maxSpanDays }),
    )
    .map(([startDay, span]) => {
      const start = civilFromDays(startDay);
      const from = midnight(start.year, start.month, start.day);
      return { from, to: addDays(from, span) };
    });
}

/** A total, stable key for a firing, for set comparison. */
export function firingKey(firing: LocalFiring): string {
  const p = (n: number, width = 2): string => String(n).padStart(width, '0');
  return (
    `${p(firing.year, 4)}${p(firing.month)}${p(firing.day)}` +
    `${p(firing.hour)}${p(firing.minute)}${p(firing.second)}`
  );
}

/** Sorts firing keys ascending, returning a new array. */
export function sortedKeys(firings: LocalFiring[]): string[] {
  return firings.map(firingKey).sort();
}
