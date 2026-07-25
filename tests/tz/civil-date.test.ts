import { describe, expect, test } from 'vitest';
import {
  civilFromDays,
  daysFromCivil,
  fieldsFromWallMillis,
  wallMillisFromFields,
  weekdayFromDays,
} from '../../src/tz/index';

describe('civil date math', () => {
  test('matches Date.UTC across ordinary, leap, and century boundaries', () => {
    const samples: [number, number, number][] = [
      [1970, 1, 1],
      [1972, 2, 29],
      [2000, 2, 29],
      [2100, 3, 1],
      [1969, 12, 31],
      [2024, 3, 10],
      [2040, 1, 1],
    ];
    for (const [year, month, day] of samples) {
      expect(daysFromCivil(year, month, day) * 86_400_000).toBe(
        Date.UTC(year, month - 1, day),
      );
    }
  });

  test('day counts round-trip through civil dates', () => {
    for (const days of [-1000, -1, 0, 1, 59, 10_000, 25_567]) {
      const { year, month, day } = civilFromDays(days);
      expect(daysFromCivil(year, month, day)).toBe(days);
    }
  });

  test('weekday matches the known epoch anchor and a known Sunday', () => {
    expect(weekdayFromDays(daysFromCivil(1970, 1, 1))).toBe(4);
    expect(weekdayFromDays(daysFromCivil(2024, 3, 10))).toBe(0);
  });

  test('wall fields round-trip through wall milliseconds', () => {
    const fields = {
      year: 2024,
      month: 11,
      day: 3,
      hour: 1,
      minute: 30,
      second: 59,
      millisecond: 250,
    };
    expect(fieldsFromWallMillis(wallMillisFromFields(fields))).toEqual(fields);
  });
});
