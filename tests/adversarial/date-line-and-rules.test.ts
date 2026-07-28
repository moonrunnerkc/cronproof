import { describe, expect, test } from 'vitest';
import {
  backend,
  classify,
  offsetSecondsAt,
  resolve,
  transitionsIn,
  utc,
} from './helpers';

describe('Pacific/Apia: two date-line moves, a repeated day in 1892 and a missing day in 2011', () => {
  test('the 1892 move steps the offset back a full day and the 2011 move steps it forward a full day, erasing 2011-12-30', () => {
    const move1892 = transitionsIn('Pacific/Apia', utc(1892, 1, 1), utc(1893, 1, 1));
    expect(move1892.map((t) => t.deltaSeconds)).toEqual([-86_400]);
    const move2011 = transitionsIn('Pacific/Apia', utc(2011, 12, 1), utc(2012, 1, 1));
    expect(move2011.map((t) => t.deltaSeconds)).toEqual([86_400]);
    const gone = resolve({ year: 2011, month: 12, day: 30, hour: 12, minute: 0, second: 0 }, 'Pacific/Apia');
    expect(gone.kind).toBe('nonexistent');
    if (gone.kind === 'nonexistent') {
      expect(gone.gapDurationMilliseconds).toBe(86_400_000);
    }
  });
});

describe('Pacific/Kiritimati: the 1994 date-line move from UTC-10 to UTC+14', () => {
  test('a single 24-hour forward transition on 1994-12-31 erases that calendar day', () => {
    const move = transitionsIn('Pacific/Kiritimati', utc(1994, 1, 1), utc(1996, 1, 1));
    expect(move).toHaveLength(1);
    expect(move[0]?.offsetBeforeSeconds).toBe(-36_000);
    expect(move[0]?.offsetAfterSeconds).toBe(50_400);
    expect(move[0]?.deltaSeconds).toBe(86_400);
    const gone = resolve({ year: 1994, month: 12, day: 31, hour: 12, minute: 0, second: 0 }, 'Pacific/Kiritimati');
    expect(gone.kind).toBe('nonexistent');
  });
});

describe('Asia/Tehran: DST abolished, last transition in 2022', () => {
  test('no transition exists after 2022 and a 2035 firing runs at the constant +3:30 footer offset with no ZONE_UNSTABLE label', () => {
    const after = transitionsIn('Asia/Tehran', utc(2023, 1, 1), utc(2040, 1, 1));
    expect(after).toEqual([]);
    expect(offsetSecondsAt('Asia/Tehran', utc(2035, 6, 15))).toBe(12_600);
    const hazards = classify('30 2 * * *', 'Asia/Tehran', 2035, 2036);
    expect(hazards.filter((h) => h.kind === 'ZONE_UNSTABLE')).toEqual([]);
  });
});

describe('America/Sao_Paulo: DST abolished, last transition in 2019', () => {
  test('no transition exists after 2019 and the offset is a constant -3h through 2030', () => {
    const after = transitionsIn('America/Sao_Paulo', utc(2020, 1, 1), utc(2040, 1, 1));
    expect(after).toEqual([]);
    expect(offsetSecondsAt('America/Sao_Paulo', utc(2024, 1, 15))).toBe(-10_800);
    expect(offsetSecondsAt('America/Sao_Paulo', utc(2030, 7, 15))).toBe(-10_800);
    const hazards = classify('30 2 * * *', 'America/Sao_Paulo', 2025, 2026);
    expect(hazards.filter((h) => h.kind === 'ZONE_UNSTABLE')).toEqual([]);
  });
});

describe('Africa/Casablanca: more than two transitions in a year, from the Ramadan pause', () => {
  test('2017 has four transitions and the +1h base offset drops to 0 during the 2024 Ramadan window', () => {
    const y2017 = transitionsIn('Africa/Casablanca', utc(2017, 1, 1), utc(2018, 1, 1));
    expect(y2017).toHaveLength(4);
    expect(offsetSecondsAt('Africa/Casablanca', utc(2024, 1, 15))).toBe(3600);
    expect(offsetSecondsAt('Africa/Casablanca', utc(2024, 3, 20))).toBe(0);
    expect(offsetSecondsAt('Africa/Casablanca', utc(2024, 5, 1))).toBe(3600);
  });
});

describe('Asia/Gaza: idiosyncratic, frequently changing DST dates', () => {
  test('the spring transition falls in April on dates that move earlier each year, not on the EU last Sunday of March', () => {
    const springDay = (year: number): string => {
      const t = transitionsIn('Asia/Gaza', utc(year, 1, 1), utc(year, 7, 1));
      const first = t[0];
      if (first === undefined) {
        throw new Error(`no spring transition for Asia/Gaza in ${year}`);
      }
      return new Date(first.instant).toISOString().slice(0, 10);
    };
    expect(springDay(2023)).toBe('2023-04-29');
    expect(springDay(2024)).toBe('2024-04-20');
    expect(springDay(2025)).toBe('2025-04-12');
  });
});

describe('America/Santiago: southern hemisphere, so DST spans the new year', () => {
  test('January is daylight time at -3h and July is standard time at -4h, with transitions in autumn and spring', () => {
    expect(backend.offsetAt(utc(2024, 1, 15), 'America/Santiago')).toEqual({
      offsetSeconds: -10_800,
      abbreviation: expect.any(String),
      isDst: true,
    });
    expect(backend.offsetAt(utc(2024, 7, 15), 'America/Santiago').isDst).toBe(false);
    expect(offsetSecondsAt('America/Santiago', utc(2024, 7, 15))).toBe(-14_400);
    const months = transitionsIn('America/Santiago', utc(2024, 1, 1), utc(2025, 1, 1)).map(
      (t) => new Date(t.instant).getUTCMonth() + 1,
    );
    expect(months).toEqual([4, 9]);
  });
});

describe('Asia/Kolkata: a half-hour offset, no DST, its last transition deep in the past', () => {
  test('the offset is a constant +5:30 with zero transitions in the modern era, so the POSIX footer governs every current firing', () => {
    expect(offsetSecondsAt('Asia/Kolkata', utc(2024, 1, 15))).toBe(19_800);
    expect(((19_800 % 3600) + 3600) % 3600).toBe(1800);
    expect(transitionsIn('Asia/Kolkata', utc(1970, 1, 1), utc(2040, 1, 1))).toEqual([]);
    expect(offsetSecondsAt('Asia/Kolkata', utc(2035, 6, 15))).toBe(19_800);
    expect(classify('30 2 * * *', 'Asia/Kolkata', 2035, 2036)).toEqual([]);
  });
});

describe('a DST footer governs firings past the last recorded transition (America/New_York)', () => {
  test('a 2039 window, beyond the 2037 table end, is labelled ZONE_UNSTABLE with the last table transition as its boundary', () => {
    const hazards = classify('0 0 * * *', 'America/New_York', 2039, 2040);
    const unstable = hazards.filter((h) => h.kind === 'ZONE_UNSTABLE');
    expect(unstable).toHaveLength(1);
    const detail = unstable[0]?.detail;
    expect(detail?.kind === 'ZONE_UNSTABLE' && detail.unstable.reason).toBe('footer-extrapolation');
    expect(detail?.kind === 'ZONE_UNSTABLE' && detail.unstable.lastTableTransitionInstant).toBe(
      Date.UTC(2037, 10, 1, 6, 0),
    );
  });
});
