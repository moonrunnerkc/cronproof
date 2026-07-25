import { describe, expect, test } from 'vitest';
import { parsePosixTz, ruleInstantUtcMillis } from '../../src/tz/index';

describe('POSIX TZ footer parsing', () => {
  test('parses a US-style rule with east-positive offsets', () => {
    const tz = parsePosixTz('EST5EDT,M3.2.0,M11.1.0');
    expect(tz).not.toBeNull();
    expect(tz?.stdAbbreviation).toBe('EST');
    expect(tz?.stdOffsetSeconds).toBe(-18_000);
    expect(tz?.dstAbbreviation).toBe('EDT');
    expect(tz?.dstOffsetSeconds).toBe(-14_400);
  });

  test('parses angle-bracket names, explicit DST offsets, and rule times (Antarctica/Troll footer)', () => {
    const tz = parsePosixTz('<+00>0<+02>-2,M3.5.0/1,M10.5.0/3');
    expect(tz?.stdAbbreviation).toBe('+00');
    expect(tz?.stdOffsetSeconds).toBe(0);
    expect(tz?.dstAbbreviation).toBe('+02');
    expect(tz?.dstOffsetSeconds).toBe(7200);
    expect(tz?.dstStart).toEqual({
      day: { form: 'month-week-day', month: 3, week: 5, weekday: 0 },
      timeSeconds: 3600,
    });
  });

  test('parses the reversed-season Dublin footer where standard time is the summer offset', () => {
    const tz = parsePosixTz('IST-1GMT0,M10.5.0,M3.5.0/1');
    expect(tz?.stdAbbreviation).toBe('IST');
    expect(tz?.stdOffsetSeconds).toBe(3600);
    expect(tz?.dstAbbreviation).toBe('GMT');
    expect(tz?.dstOffsetSeconds).toBe(0);
  });

  test('parses a constant-offset zone with no DST', () => {
    const tz = parsePosixTz('<-03>3');
    expect(tz?.stdOffsetSeconds).toBe(-10_800);
    expect(tz?.dstAbbreviation).toBeNull();
    expect(tz?.dstStart).toBeNull();
  });

  test('returns null on malformed input', () => {
    expect(parsePosixTz('')).toBeNull();
    expect(parsePosixTz('E5')).toBeNull();
    expect(parsePosixTz('EST5EDT,M3.2.0')).toBeNull();
    expect(parsePosixTz('EST5EDT4:junk')).toBeNull();
  });

  test('computes the 2024 US spring-forward instant from the rule', () => {
    const tz = parsePosixTz('EST5EDT,M3.2.0,M11.1.0');
    if (tz?.dstStart == null || tz.stdOffsetSeconds === null) {
      throw new Error('parse failed');
    }
    expect(ruleInstantUtcMillis(tz.dstStart, 2024, tz.stdOffsetSeconds)).toBe(
      Date.UTC(2024, 2, 10, 7, 0),
    );
  });

  test('resolves week 5 to the last weekday of the month', () => {
    const tz = parsePosixTz('CET-1CEST,M3.5.0,M10.5.0/3');
    if (tz?.dstStart == null) {
      throw new Error('parse failed');
    }
    expect(ruleInstantUtcMillis(tz.dstStart, 2024, 3600)).toBe(Date.UTC(2024, 2, 31, 1, 0));
  });

  test('julian day rules skip February 29 while zero-based day rules count it', () => {
    const noLeap = parsePosixTz('AAA0BBB,J60/0,J300/0');
    const withLeap = parsePosixTz('AAA0BBB,60/0,300/0');
    if (noLeap?.dstStart == null || withLeap?.dstStart == null) {
      throw new Error('parse failed');
    }
    expect(ruleInstantUtcMillis(noLeap.dstStart, 2024, 0)).toBe(Date.UTC(2024, 2, 1, 0, 0));
    expect(ruleInstantUtcMillis(withLeap.dstStart, 2024, 0)).toBe(Date.UTC(2024, 2, 1, 0, 0));
    expect(ruleInstantUtcMillis(noLeap.dstStart, 2023, 0)).toBe(Date.UTC(2023, 2, 1, 0, 0));
    expect(ruleInstantUtcMillis(withLeap.dstStart, 2023, 0)).toBe(Date.UTC(2023, 2, 2, 0, 0));
  });
});
