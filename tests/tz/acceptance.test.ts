import { describe, expect, test } from 'vitest';
import {
  createIntlBackend,
  createTzifBackend,
  resolveWallClock,
  vendoredZoneinfoRoot,
  type TzBackend,
} from '../../src/tz/index';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the vendoring step');
}

const backends: [string, TzBackend][] = [
  ['tzif backend', createTzifBackend({ zoneinfoRoot: vendorRoot })],
  ['intl backend', createIntlBackend()],
];

describe.each(backends)('%s', (_name, backend) => {
  test('2024-03-10T02:30 America/New_York is nonexistent with a one-hour gap', () => {
    const result = resolveWallClock(
      { year: 2024, month: 3, day: 10, hour: 2, minute: 30 },
      'America/New_York',
      backend,
    );
    expect(result.kind).toBe('nonexistent');
    if (result.kind !== 'nonexistent') {
      return;
    }
    expect(result.transitionInstant).toBe(Date.UTC(2024, 2, 10, 7, 0));
    expect(result.gapStartWallMillis).toBe(Date.UTC(2024, 2, 10, 2, 0));
    expect(result.gapEndWallMillis).toBe(Date.UTC(2024, 2, 10, 3, 0));
    expect(result.gapDurationMilliseconds).toBe(3_600_000);
  });

  test('2024-11-03T01:30 America/New_York is ambiguous with a one-hour fold', () => {
    const result = resolveWallClock(
      { year: 2024, month: 11, day: 3, hour: 1, minute: 30 },
      'America/New_York',
      backend,
    );
    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') {
      return;
    }
    expect(result.earlierInstant).toBe(Date.UTC(2024, 10, 3, 5, 30));
    expect(result.laterInstant).toBe(Date.UTC(2024, 10, 3, 6, 30));
    expect(result.candidateInstants).toEqual([
      Date.UTC(2024, 10, 3, 5, 30),
      Date.UTC(2024, 10, 3, 6, 30),
    ]);
    expect(result.foldDurationMilliseconds).toBe(3_600_000);
  });

  test('Australia/Lord_Howe 2024-10-06: 02:15 nonexistent and 02:45 unique, because the shift is 30 minutes', () => {
    const skipped = resolveWallClock(
      { year: 2024, month: 10, day: 6, hour: 2, minute: 15 },
      'Australia/Lord_Howe',
      backend,
    );
    expect(skipped.kind).toBe('nonexistent');
    if (skipped.kind === 'nonexistent') {
      expect(skipped.gapStartWallMillis).toBe(Date.UTC(2024, 9, 6, 2, 0));
      expect(skipped.gapEndWallMillis).toBe(Date.UTC(2024, 9, 6, 2, 30));
      expect(skipped.gapDurationMilliseconds).toBe(1_800_000);
    }
    const unique = resolveWallClock(
      { year: 2024, month: 10, day: 6, hour: 2, minute: 45 },
      'Australia/Lord_Howe',
      backend,
    );
    expect(unique.kind).toBe('unique');
    if (unique.kind === 'unique') {
      expect(unique.instant).toBe(Date.UTC(2024, 9, 5, 15, 45));
      expect(unique.offsetSeconds).toBe(39_600);
    }
  });

  test('Antarctica/Troll 2024-03-31 produces a 2-hour gap', () => {
    const result = resolveWallClock(
      { year: 2024, month: 3, day: 31, hour: 2, minute: 0 },
      'Antarctica/Troll',
      backend,
    );
    expect(result.kind).toBe('nonexistent');
    if (result.kind !== 'nonexistent') {
      return;
    }
    expect(result.transitionInstant).toBe(Date.UTC(2024, 2, 31, 1, 0));
    expect(result.gapStartWallMillis).toBe(Date.UTC(2024, 2, 31, 1, 0));
    expect(result.gapEndWallMillis).toBe(Date.UTC(2024, 2, 31, 3, 0));
    expect(result.gapDurationMilliseconds).toBe(7_200_000);
  });

  test('Europe/Dublin resolves correctly under negative DST: winter offset 0, summer offset +1h, gap and fold at the transitions', () => {
    expect(backend.offsetAt(Date.UTC(2024, 0, 15), 'Europe/Dublin').offsetSeconds).toBe(0);
    expect(backend.offsetAt(Date.UTC(2024, 6, 15), 'Europe/Dublin').offsetSeconds).toBe(3600);
    const spring = resolveWallClock(
      { year: 2024, month: 3, day: 31, hour: 1, minute: 30 },
      'Europe/Dublin',
      backend,
    );
    expect(spring.kind).toBe('nonexistent');
    if (spring.kind === 'nonexistent') {
      expect(spring.gapDurationMilliseconds).toBe(3_600_000);
    }
    const autumn = resolveWallClock(
      { year: 2024, month: 10, day: 27, hour: 1, minute: 30 },
      'Europe/Dublin',
      backend,
    );
    expect(autumn.kind).toBe('ambiguous');
    if (autumn.kind === 'ambiguous') {
      expect(autumn.earlierInstant).toBe(Date.UTC(2024, 9, 27, 0, 30));
      expect(autumn.laterInstant).toBe(Date.UTC(2024, 9, 27, 1, 30));
      expect(autumn.foldDurationMilliseconds).toBe(3_600_000);
    }
  });

  test('Pacific/Apia 2011-12-30 is a fully nonexistent calendar day', () => {
    const gapStart = Date.UTC(2011, 11, 30, 0, 0);
    const gapEnd = Date.UTC(2011, 11, 31, 0, 0);
    for (const [hour, minute, second, millisecond] of [
      [0, 0, 0, 0],
      [12, 0, 0, 0],
      [23, 59, 59, 999],
    ] as const) {
      const result = resolveWallClock(
        { year: 2011, month: 12, day: 30, hour, minute, second, millisecond },
        'Pacific/Apia',
        backend,
      );
      expect(result.kind).toBe('nonexistent');
      if (result.kind === 'nonexistent') {
        expect(result.gapStartWallMillis).toBe(gapStart);
        expect(result.gapEndWallMillis).toBe(gapEnd);
        expect(result.gapDurationMilliseconds).toBe(86_400_000);
      }
    }
    const dayBefore = resolveWallClock(
      { year: 2011, month: 12, day: 29, hour: 23, minute: 59, second: 59 },
      'Pacific/Apia',
      backend,
    );
    expect(dayBefore.kind).toBe('unique');
    const dayAfter = resolveWallClock(
      { year: 2011, month: 12, day: 31, hour: 0, minute: 0 },
      'Pacific/Apia',
      backend,
    );
    expect(dayAfter.kind).toBe('unique');
  });

  test('Asia/Tehran shows transitions before 2022 and none after', () => {
    const all = backend.transitionsBetween(
      Date.UTC(1970, 0, 1),
      Date.UTC(2040, 0, 1),
      'Asia/Tehran',
    );
    expect(all.length).toBeGreaterThan(0);
    const last = all[all.length - 1];
    expect(last?.instant).toBe(Date.UTC(2022, 8, 21, 19, 30));
    const after = backend.transitionsBetween(
      Date.UTC(2023, 0, 1),
      Date.UTC(2040, 0, 1),
      'Asia/Tehran',
    );
    expect(after).toEqual([]);
  });
});

describe('negative DST data is reported raw, never as a season proxy', () => {
  test('vendored TZif reports Europe/Dublin winter as the DST variant at offset 0 and summer as standard time at +1h', () => {
    const backend = createTzifBackend({ zoneinfoRoot: vendorRoot });
    const winter = backend.offsetAt(Date.UTC(2024, 0, 15), 'Europe/Dublin');
    const summer = backend.offsetAt(Date.UTC(2024, 6, 15), 'Europe/Dublin');
    expect(winter).toEqual({ offsetSeconds: 0, abbreviation: 'GMT', isDst: true });
    expect(summer).toEqual({ offsetSeconds: 3600, abbreviation: 'IST', isDst: false });
  });
});
