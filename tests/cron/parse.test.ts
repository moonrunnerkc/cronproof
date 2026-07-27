import { describe, expect, test } from 'vitest';
import { enumerate, parse } from '../../src/cron/index';
import type { CronAst } from '../../src/cron/index';

function ast(source: string, dialect: Parameters<typeof parse>[1]): CronAst {
  const result = parse(source, dialect);
  if (!result.ok) {
    throw new Error(`parse failed: ${JSON.stringify(result.errors)}`);
  }
  return result.ast;
}

describe('source-level detail preserved for later phases', () => {
  test('a literal leading asterisk is recorded distinctly from an equivalent value set', () => {
    const star = ast('* * * * *', 'vixie');
    expect(star.minute.startsWithAsterisk).toBe(true);
    expect(star.minute.wildcard).toBe(true);
    expect(star.hour.startsWithAsterisk).toBe(true);

    const stepped = ast('*/5 */2 * * *', 'vixie');
    expect(stepped.minute.startsWithAsterisk).toBe(true);
    expect(stepped.minute.wildcard).toBe(false);
    expect(stepped.hour.startsWithAsterisk).toBe(true);
    expect(stepped.hour.wildcard).toBe(false);

    const explicit = ast('0 0 * * *', 'vixie');
    expect(explicit.minute.startsWithAsterisk).toBe(false);
    expect(explicit.hour.startsWithAsterisk).toBe(false);
  });
});

describe('day-of-week numbering canonicalizes to 0 (Sunday) through 6', () => {
  test('Vixie treats both 0 and 7 as Sunday', () => {
    expect(ast('0 0 * * 0', 'vixie').dayOfWeek.weekdays).toEqual([0]);
    expect(ast('0 0 * * 7', 'vixie').dayOfWeek.weekdays).toEqual([0]);
    expect(ast('0 0 * * 0-7', 'vixie').dayOfWeek.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('Quartz numbers Sunday as 1, so 1 canonicalizes to 0 and 7 to Saturday', () => {
    expect(ast('0 0 0 ? * 1', 'quartz').dayOfWeek.weekdays).toEqual([0]);
    expect(ast('0 0 0 ? * 7', 'quartz').dayOfWeek.weekdays).toEqual([6]);
  });

  test('weekday and month names resolve case-insensitively to the same canonical values', () => {
    expect(ast('0 0 * * mon-fri', 'vixie').dayOfWeek.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(ast('0 0 * JAN,dec *', 'vixie').month.values).toEqual([1, 12]);
  });
});

describe('macros', () => {
  test('@midnight and @daily expand to the same midnight schedule', () => {
    const a = ast('@midnight', 'vixie');
    const b = ast('@daily', 'vixie');
    expect(a.minute.values).toEqual([0]);
    expect(a.hour.values).toEqual([0]);
    expect(b.hour.values).toEqual(a.hour.values);
  });

  test('@reboot parses as a reboot schedule that enumerates to nothing', () => {
    const rebooted = ast('@reboot', 'debian');
    expect(rebooted.reboot).toBe(true);
    const firings = enumerate(rebooted, {
      zone: 'UTC',
      from: { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      to: { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    });
    expect(firings).toEqual([]);
  });
});

describe('error locations', () => {
  test('an out-of-range value reports the offset of the offending field', () => {
    const result = parse('0 0 * * 9', 'vixie');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const first = result.errors[0];
    expect(first?.field).toBe('day-of-week');
    expect(first?.offset).toBe(8);
    expect(first?.reason).toContain('out of range');
  });
});
