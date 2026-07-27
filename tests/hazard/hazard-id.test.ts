import { beforeAll, describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import { classifyHazards, hazardId } from '../../src/hazard/index';
import type { HazardIdentity } from '../../src/hazard/index';
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

const NY_SKIPPED: HazardIdentity = {
  expression: '30 2 * * *',
  dialect: 'vixie',
  zone: 'America/New_York',
  intendedLocal: { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 },
  kind: 'SKIPPED',
};

// A change to the hash function must fail this loudly: the id is a
// contract that baselines and CI suppressions depend on.
const KNOWN_ID = 'hz_feef0ab468b6e246';

describe('hazard id stability', () => {
  test('the id of a known hazard equals a pinned literal', () => {
    expect(hazardId(NY_SKIPPED)).toBe(KNOWN_ID);
  });

  test('the classifier assigns that same id to the hazard it produces', () => {
    const parsed = parse('30 2 * * *', 'vixie');
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const hazards = classifyHazards(parsed.ast, backend, {
      expression: '30 2 * * *',
      dialect: 'vixie',
      zone: 'America/New_York',
      from: { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      to: { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      zoneinfoRoot: ROOT,
    });
    const skipped = hazards.find((hazard) => hazard.kind === 'SKIPPED');
    expect(skipped?.id).toBe(KNOWN_ID);
  });

  test('the id changes when any identity field changes', () => {
    const base = hazardId(NY_SKIPPED);
    expect(hazardId({ ...NY_SKIPPED, expression: '31 2 * * *' })).not.toBe(base);
    expect(hazardId({ ...NY_SKIPPED, dialect: 'debian' })).not.toBe(base);
    expect(hazardId({ ...NY_SKIPPED, zone: 'America/Chicago' })).not.toBe(base);
    expect(hazardId({ ...NY_SKIPPED, kind: 'DOUBLED' })).not.toBe(base);
    expect(
      hazardId({ ...NY_SKIPPED, intendedLocal: { ...NY_SKIPPED.intendedLocal, minute: 31 } }),
    ).not.toBe(base);
  });

  test('the id does not depend on severity, so the idempotence flag cannot change it', () => {
    const parsed = parse('30 1 * * *', 'vixie');
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const run = (idempotent: boolean): string | undefined => {
      const hazards = classifyHazards(parsed.ast, backend, {
        expression: '30 1 * * *',
        dialect: 'vixie',
        zone: 'America/New_York',
        from: { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        to: { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
        zoneinfoRoot: ROOT,
        idempotent,
      });
      return hazards.find((hazard) => hazard.kind === 'DOUBLED')?.id;
    };
    const strict = run(false);
    const idempotent = run(true);
    expect(strict).toBeDefined();
    expect(idempotent).toBe(strict);
  });
});
