import { describe, expect, test } from 'vitest';
import { enumerate, parse } from '../../src/cron/index';
import type { DialectId, LocalFiring, WallClock } from '../../src/cron/index';

function fmt(f: LocalFiring): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  return `${p(f.year, 4)}-${p(f.month)}-${p(f.day)} ${p(f.hour)}:${p(f.minute)}:${p(f.second)}`;
}

function fire(
  source: string,
  dialect: DialectId,
  from: WallClock,
  to: WallClock,
  limit?: number,
): string[] {
  const result = parse(source, dialect);
  if (!result.ok) {
    throw new Error(`parse failed: ${JSON.stringify(result.errors)}`);
  }
  return enumerate(result.ast, limit === undefined ? { zone: 'UTC', from, to } : { zone: 'UTC', from, to, limit }).map(fmt);
}

const START = (year: number, month: number): WallClock => ({ year, month, day: 1, hour: 0, minute: 0, second: 0 });

describe('day-of-month / day-of-week combination', () => {
  const feb = { from: START(2024, 2), to: START(2024, 3) };

  test('Vixie OR quirk: with both day fields restricted, the 13th fires even though it is not a Friday', () => {
    expect(fire('0 0 13 2 5', 'vixie', feb.from, feb.to)).toEqual([
      '2024-02-02 00:00:00',
      '2024-02-09 00:00:00',
      '2024-02-13 00:00:00',
      '2024-02-16 00:00:00',
      '2024-02-23 00:00:00',
    ]);
  });

  test('day-of-week wildcard forces AND: only the 13th of February fires', () => {
    expect(fire('0 0 13 2 *', 'vixie', feb.from, feb.to)).toEqual(['2024-02-13 00:00:00']);
  });

  test('day-of-month wildcard forces AND: only the Fridays of February fire', () => {
    expect(fire('0 0 * 2 5', 'vixie', feb.from, feb.to)).toEqual([
      '2024-02-02 00:00:00',
      '2024-02-09 00:00:00',
      '2024-02-16 00:00:00',
      '2024-02-23 00:00:00',
    ]);
  });
});

describe('step-on-range', () => {
  test('5-30/7 in the minute field fires at 5, 12, 19, 26', () => {
    expect(fire('5-30/7 0 1 1 *', 'vixie', START(2024, 1), START(2024, 2))).toEqual([
      '2024-01-01 00:05:00',
      '2024-01-01 00:12:00',
      '2024-01-01 00:19:00',
      '2024-01-01 00:26:00',
    ]);
  });
});

describe('Quartz and AWS special day tokens', () => {
  const year = { from: START(2024, 1), to: START(2025, 1) };
  const q1 = { from: START(2024, 1), to: START(2024, 5) };

  test('MON#5 fires only in the months that have a fifth Monday', () => {
    expect(fire('0 0 0 ? * MON#5', 'quartz', year.from, year.to)).toEqual([
      '2024-01-29 00:00:00',
      '2024-04-29 00:00:00',
      '2024-07-29 00:00:00',
      '2024-09-30 00:00:00',
      '2024-12-30 00:00:00',
    ]);
  });

  test('L in day-of-month fires on the actual last day of each month', () => {
    expect(fire('0 0 0 L * ?', 'quartz', q1.from, q1.to)).toEqual([
      '2024-01-31 00:00:00',
      '2024-02-29 00:00:00',
      '2024-03-31 00:00:00',
      '2024-04-30 00:00:00',
    ]);
  });

  test('LW moves the last-of-month to the preceding Friday when the last day is a weekend', () => {
    expect(fire('0 0 0 LW * ?', 'quartz', q1.from, q1.to)).toEqual([
      '2024-01-31 00:00:00',
      '2024-02-29 00:00:00',
      '2024-03-29 00:00:00',
      '2024-04-30 00:00:00',
    ]);
  });

  test('nW picks the weekday nearest the target, staying inside the month', () => {
    expect(fire('0 0 0 15W * ?', 'quartz', START(2024, 6), START(2024, 7))).toEqual(['2024-06-14 00:00:00']);
    expect(fire('0 0 0 15W * ?', 'quartz', START(2024, 9), START(2024, 10))).toEqual(['2024-09-16 00:00:00']);
    expect(fire('0 0 0 15W * ?', 'quartz', START(2024, 7), START(2024, 8))).toEqual(['2024-07-15 00:00:00']);
  });

  test('AWS 6L fires on the last Friday of each month', () => {
    expect(fire('0 0 ? * 6L *', 'aws-eventbridge', q1.from, q1.to)).toEqual([
      '2024-01-26 00:00:00',
      '2024-02-23 00:00:00',
      '2024-03-29 00:00:00',
      '2024-04-26 00:00:00',
    ]);
  });
});

describe('systemd OnCalendar maps to the same firing semantics', () => {
  test('Mon..Fri weekday range fires on weekdays only', () => {
    expect(
      fire('Mon..Fri *-*-* 09:30:00', 'systemd', { year: 2024, month: 3, day: 8, hour: 0, minute: 0, second: 0 }, { year: 2024, month: 3, day: 16, hour: 0, minute: 0, second: 0 }),
    ).toEqual([
      '2024-03-08 09:30:00',
      '2024-03-11 09:30:00',
      '2024-03-12 09:30:00',
      '2024-03-13 09:30:00',
      '2024-03-14 09:30:00',
      '2024-03-15 09:30:00',
    ]);
  });

  test('the ~ operator fires on the third-to-last day of February', () => {
    expect(fire('*-02~03 12:00:00', 'systemd', START(2024, 1), START(2025, 1))).toEqual(['2024-02-27 12:00:00']);
  });
});
