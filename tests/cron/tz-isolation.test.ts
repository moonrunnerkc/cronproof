import { describe, expect, test, vi } from 'vitest';
import { enumerate, parse } from '../../src/cron/index';
import type { WallClock } from '../../src/cron/index';

/*
 * Replace the timezone module so that calling any of its exports
 * throws. Enumeration must still succeed, proving it neither imports
 * nor calls timezone code. If a future change routes enumeration
 * through the tz module, one of these calls will throw and this test
 * will fail.
 */
vi.mock('../../src/tz/index', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const boom = (): never => {
    throw new Error('enumeration must not call the timezone module');
  };
  const mocked: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mocked[key] = boom;
  }
  return mocked;
});

const FROM: WallClock = { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
const TO: WallClock = { year: 2024, month: 1, day: 8, hour: 0, minute: 0, second: 0 };

function fireCount(source: string, zone: string): number {
  const result = parse(source, 'vixie');
  if (!result.ok) {
    throw new Error('parse failed');
  }
  return enumerate(result.ast, { zone, from: FROM, to: TO }).length;
}

describe('enumeration is independent of the timezone module', () => {
  test('the mocked timezone module throws when any export is called', async () => {
    const tz = await import('../../src/tz/index');
    const call = tz.resolveWallClock as unknown as () => unknown;
    expect(() => call()).toThrow('must not call the timezone module');
  });

  test('enumeration produces firings while the timezone module is mocked to throw', () => {
    const result = parse('0 0 * * *', 'vixie');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const firings = enumerate(result.ast, { zone: 'America/New_York', from: FROM, to: TO });
    expect(firings.length).toBe(7);
    expect(firings[0]).toEqual({ year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  });

  test('enumeration output is identical regardless of the zone argument', () => {
    const zones = ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Kolkata', 'not-a-zone'];
    const counts = zones.map((zone) => fireCount('*/15 9-17 * * MON-FRI', zone));
    for (const count of counts) {
      expect(count).toBe(counts[0]);
    }
    expect(counts[0]).toBeGreaterThan(0);
  });
});
