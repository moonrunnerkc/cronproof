import { describe, expect, test } from 'vitest';
import {
  createIntlBackend,
  createTzifBackend,
  crossCheckZone,
  runCrossCheck,
  vendoredZoneinfoRoot,
  type TzBackend,
  type ZoneTransition,
} from '../../src/tz/index';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the vendoring step');
}

const intl = createIntlBackend();
const tzif = createTzifBackend({ zoneinfoRoot: vendorRoot });

const RANGE_START = Date.UTC(1970, 0, 1);
const RANGE_END = Date.UTC(2040, 0, 1);

describe('backend cross-check', () => {
  test('both backends agree on every transition instant and offset for hazard-heavy zones, 1970 to 2040', () => {
    const report = runCrossCheck({
      backendA: intl,
      backendB: tzif,
      zones: [
        'America/New_York',
        'Europe/Dublin',
        'Australia/Lord_Howe',
        'Pacific/Apia',
        'Asia/Tehran',
        'Antarctica/Troll',
        'America/Boa_Vista',
        'Pacific/Kiritimati',
      ],
      startUtcMillis: RANGE_START,
      endUtcMillis: RANGE_END,
    });
    expect(report.disagreements).toEqual([]);
    expect(report.zonesChecked).toBe(8);
    expect(report.transitionsCompared).toBeGreaterThan(200);
  });

  test('a one-week DST stint shorter than the scan probe is still verified through direct offset queries (America/Boa_Vista, October 2000)', () => {
    const result = crossCheckZone(
      intl,
      tzif,
      'America/Boa_Vista',
      Date.UTC(2000, 0, 1),
      Date.UTC(2001, 0, 1),
    );
    expect(result.disagreements).toEqual([]);
    const instants = tzif
      .transitionsBetween(Date.UTC(2000, 0, 1), Date.UTC(2001, 0, 1), 'America/Boa_Vista')
      .map((t) => t.instant);
    expect(instants).toContain(Date.UTC(2000, 9, 8, 4, 0));
    expect(instants).toContain(Date.UTC(2000, 9, 15, 3, 0));
  });

  test('a backend reporting shifted transition instants is caught, naming the zone and instant', () => {
    const shifted: TzBackend = {
      name: 'tzif-shifted',
      offsetAt: (instant, zone) => tzif.offsetAt(instant, zone),
      transitionsBetween: (start, end, zone) =>
        tzif
          .transitionsBetween(start, end, zone)
          .map((t): ZoneTransition => ({ ...t, instant: t.instant + 3_600_000 })),
    };
    const result = crossCheckZone(
      intl,
      shifted,
      'America/New_York',
      Date.UTC(2024, 0, 1),
      Date.UTC(2025, 0, 1),
    );
    expect(result.disagreements.length).toBeGreaterThan(0);
    const first = result.disagreements[0];
    expect(first?.zone).toBe('America/New_York');
    expect(first?.instant).not.toBeNull();
  });

  test('a transition missing from the TZif list is caught by the scan direction', () => {
    const dropping: TzBackend = {
      name: 'tzif-dropping',
      offsetAt: (instant, zone) => tzif.offsetAt(instant, zone),
      transitionsBetween: (start, end, zone) =>
        tzif.transitionsBetween(start, end, zone).slice(1),
    };
    const result = crossCheckZone(
      intl,
      dropping,
      'America/New_York',
      Date.UTC(2024, 0, 1),
      Date.UTC(2025, 0, 1),
    );
    expect(
      result.disagreements.some((d) => d.detail.includes('backend B does not have')),
    ).toBe(true);
  });
});
