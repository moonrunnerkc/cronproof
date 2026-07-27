import { beforeAll, describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import { classifyHazards, severityFor, severityRank } from '../../src/hazard/index';
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

describe('severity model', () => {
  test('a double of non-idempotent work outranks a skip', () => {
    expect(severityRank(severityFor('DOUBLED', false))).toBeGreaterThan(
      severityRank(severityFor('SKIPPED', false)),
    );
  });

  test('marking work idempotent drops a double below a skip', () => {
    expect(severityRank(severityFor('DOUBLED', true))).toBeLessThan(
      severityRank(severityFor('SKIPPED', false)),
    );
  });

  test('non-idempotent double is critical and skip is high by default', () => {
    expect(severityFor('DOUBLED', false)).toBe('critical');
    expect(severityFor('SKIPPED', false)).toBe('high');
    expect(severityFor('ZONE_UNSTABLE', false)).toBe('info');
  });

  test('the idempotence flag flips a real doubled hazard from critical to low without changing anything else', () => {
    const parsed = parse('30 1 * * *', 'vixie');
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const severityOf = (idempotent: boolean): string | undefined => {
      const hazards = classifyHazards(parsed.ast, backend, {
        expression: '30 1 * * *',
        dialect: 'vixie',
        zone: 'America/New_York',
        from: { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        to: { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        zoneinfoRoot: ROOT,
        idempotent,
      });
      return hazards.find((hazard) => hazard.kind === 'DOUBLED')?.severity;
    };
    expect(severityOf(false)).toBe('critical');
    expect(severityOf(true)).toBe('low');
  });
});
