import { describe, expect, test } from 'vitest';
import { offsetSecondsAt, resolve, transitionsIn, utc } from './helpers';

describe('America/New_York: a one-hour spring gap and a one-hour fall fold', () => {
  test('02:30 on 2024-03-10 is nonexistent with a one-hour gap, 01:30 on 2024-11-03 is ambiguous with a one-hour fold', () => {
    expect(offsetSecondsAt('America/New_York', utc(2024, 1, 15))).toBe(-18000);
    expect(offsetSecondsAt('America/New_York', utc(2024, 7, 15))).toBe(-14400);
    const gap = resolve({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 }, 'America/New_York');
    expect(gap.kind).toBe('nonexistent');
    if (gap.kind === 'nonexistent') {
      expect(gap.gapDurationMilliseconds).toBe(3_600_000);
    }
    const fold = resolve({ year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 }, 'America/New_York');
    expect(fold.kind).toBe('ambiguous');
    if (fold.kind === 'ambiguous') {
      expect(fold.foldDurationMilliseconds).toBe(3_600_000);
    }
  });
});

describe('Europe/Dublin: negative DST, so the DST flag is set in winter', () => {
  test('January is the DST variant at offset 0 and July is standard time at +1h', () => {
    const winter = { instant: utc(2024, 1, 15) };
    const summer = { instant: utc(2024, 7, 15) };
    expect(offsetSecondsAt('Europe/Dublin', winter.instant)).toBe(0);
    expect(offsetSecondsAt('Europe/Dublin', summer.instant)).toBe(3600);
    expect(offsetSecondsAt('Europe/Dublin', winter.instant)).toBeLessThan(
      offsetSecondsAt('Europe/Dublin', summer.instant),
    );
  });
});

describe('Australia/Lord_Howe: a 30-minute DST shift, not the usual hour', () => {
  test('the 2024 transitions move the clock by exactly 1800 seconds, and 02:15 is skipped while 02:45 exists', () => {
    const transitions = transitionsIn('Australia/Lord_Howe', utc(2024, 1, 1), utc(2025, 1, 1));
    expect(transitions.map((t) => Math.abs(t.deltaSeconds))).toEqual([1800, 1800]);
    const skipped = resolve({ year: 2024, month: 10, day: 6, hour: 2, minute: 15, second: 0 }, 'Australia/Lord_Howe');
    expect(skipped.kind).toBe('nonexistent');
    if (skipped.kind === 'nonexistent') {
      expect(skipped.gapDurationMilliseconds).toBe(1_800_000);
    }
    expect(resolve({ year: 2024, month: 10, day: 6, hour: 2, minute: 45, second: 0 }, 'Australia/Lord_Howe').kind).toBe('unique');
  });
});

describe('Pacific/Chatham: a 45-minute offset from UTC', () => {
  test('both the standard and summer offsets carry a 45-minute (2700 second) component', () => {
    const winter = offsetSecondsAt('Pacific/Chatham', utc(2024, 7, 15));
    const summer = offsetSecondsAt('Pacific/Chatham', utc(2024, 1, 15));
    expect(winter).toBe(45_900);
    expect(summer).toBe(49_500);
    expect(((winter % 3600) + 3600) % 3600).toBe(2700);
    expect(((summer % 3600) + 3600) % 3600).toBe(2700);
  });
});

describe('Antarctica/Troll: a two-hour DST shift', () => {
  test('the March 2024 transition opens a two-hour gap, so 02:00 on 2024-03-31 is nonexistent for two hours', () => {
    const spring = transitionsIn('Antarctica/Troll', utc(2024, 1, 1), utc(2024, 7, 1));
    expect(spring.map((t) => t.deltaSeconds)).toEqual([7200]);
    const gap = resolve({ year: 2024, month: 3, day: 31, hour: 2, minute: 0, second: 0 }, 'Antarctica/Troll');
    expect(gap.kind).toBe('nonexistent');
    if (gap.kind === 'nonexistent') {
      expect(gap.gapDurationMilliseconds).toBe(7_200_000);
    }
  });
});

describe('Europe/Lisbon: the ordinary EU rule, as a control', () => {
  test('offset is 0 in winter and +1h in summer, with transitions on the last Sundays of March and October 2024', () => {
    expect(offsetSecondsAt('Europe/Lisbon', utc(2024, 1, 15))).toBe(0);
    expect(offsetSecondsAt('Europe/Lisbon', utc(2024, 7, 15))).toBe(3600);
    const transitions = transitionsIn('Europe/Lisbon', utc(2024, 1, 1), utc(2025, 1, 1));
    expect(transitions.map((t) => new Date(t.instant).toISOString())).toEqual([
      '2024-03-31T01:00:00.000Z',
      '2024-10-27T01:00:00.000Z',
    ]);
  });
});
