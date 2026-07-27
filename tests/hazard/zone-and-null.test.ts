import { beforeAll, describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import type { DialectId, LocalFiring } from '../../src/cron/index';
import { classifyHazards } from '../../src/hazard/index';
import type { Hazard } from '../../src/hazard/index';
import { createTzifBackend, vendoredZoneinfoRoot, type TzifBackend } from '../../src/tz/index';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;

let backend: TzifBackend;
beforeAll(() => {
  backend = createTzifBackend({ zoneinfoRoot: ROOT });
});

const midnight = (year: number): LocalFiring => ({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 });

function classify(expression: string, dialect: DialectId, zone: string, fromYear: number, toYear: number): Hazard[] {
  const parsed = parse(expression, dialect);
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  return classifyHazards(parsed.ast, backend, {
    expression,
    dialect,
    zone,
    from: midnight(fromYear),
    to: midnight(toYear),
    zoneinfoRoot: ROOT,
  });
}

describe('null test: UTC schedules produce zero hazards', () => {
  const schedules: [string, DialectId][] = [
    ['*/15 * * * *', 'vixie'],
    ['30 2 * * *', 'vixie'],
    ['0 0 * * *', 'vixie'],
    ['30 5 * * 1-5', 'github-actions'],
  ];
  const utcZones = ['UTC', 'Etc/UTC'];

  test.each(schedules)('%s in %s dialect yields no hazards in any UTC zone', (expression, dialect) => {
    for (const zone of utcZones) {
      const hazards = classify(expression, dialect, zone, 2024, 2026);
      expect(hazards, `${expression} in ${zone}`).toEqual([]);
    }
  });
});

describe('ZONE_UNSTABLE labels predicted regions past the last recorded transition', () => {
  test('a daily job the year after New York\'s last table transition is labeled footer-extrapolation', () => {
    const hazards = classify('0 12 * * *', 'vixie', 'America/New_York', 2038, 2039);
    const unstable = hazards.filter((hazard) => hazard.kind === 'ZONE_UNSTABLE');
    expect(unstable).toHaveLength(1);
    const hazard = unstable[0];
    expect(hazard?.severity).toBe('info');
    expect(hazard?.detail.kind === 'ZONE_UNSTABLE' && hazard.detail.unstable.reason).toBe('footer-extrapolation');
    expect(hazard?.detail.kind === 'ZONE_UNSTABLE' && hazard.detail.unstable.lastTableTransitionInstant).toBe(
      Date.UTC(2037, 10, 1, 6, 0),
    );
  });

  test('a constant-offset zone past its last transition is not labeled unstable (extrapolation is exact)', () => {
    const hazards = classify('0 12 * * *', 'vixie', 'Asia/Tehran', 2030, 2031);
    expect(hazards.filter((hazard) => hazard.kind === 'ZONE_UNSTABLE')).toEqual([]);
  });
});
