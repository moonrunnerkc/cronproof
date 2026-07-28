import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { formatLocal, hazardId } from '../../src/hazard/index';
import type { HazardIdentity } from '../../src/hazard/index';
import type { HazardKind } from '../../src/hazard/index';
import type { DialectId, LocalFiring } from '../../src/cron/index';

const SEED = 0xc0111de5;
const NUM_RUNS = 20_000;

const KINDS: HazardKind[] = ['SKIPPED', 'DOUBLED', 'INTERVAL_DRIFT', 'COUNT_ANOMALY', 'ZONE_UNSTABLE'];
const DIALECTS: DialectId[] = ['vixie', 'debian', 'quartz', 'k8s', 'systemd'];
const ZONES = ['America/New_York', 'Europe/Dublin', 'Asia/Kolkata', 'UTC', 'Pacific/Apia'];

/** The exact string hazardId hashes, used to tell a true collision from a repeat. */
function canonical(identity: HazardIdentity): string {
  return [
    identity.expression,
    identity.dialect,
    identity.zone,
    formatLocal(identity.intendedLocal),
    identity.kind,
  ].join(' ');
}

const localArb: fc.Arbitrary<LocalFiring> = fc.record({
  year: fc.integer({ min: 1970, max: 2099 }),
  month: fc.integer({ min: 1, max: 12 }),
  day: fc.integer({ min: 1, max: 28 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
  second: fc.constant(0),
});

const identityArb: fc.Arbitrary<HazardIdentity> = fc.record({
  expression: fc.integer({ min: 0, max: 59 }).chain((m) =>
    fc.integer({ min: 0, max: 23 }).map((h) => `${m} ${h} * * *`),
  ),
  dialect: fc.constantFrom(...DIALECTS),
  zone: fc.constantFrom(...ZONES),
  intendedLocal: localArb,
  kind: fc.constantFrom(...KINDS),
});

describe('hazard ids are collision-free across a large generated corpus', () => {
  test(`no two distinct identities share an id over a deterministic sweep of every dialect, zone, kind, and a dense date grid`, () => {
    const seen = new Map<string, string>();
    let count = 0;
    let collisions = 0;
    for (const dialect of DIALECTS) {
      for (const zone of ZONES) {
        for (const kind of KINDS) {
          for (let minute = 0; minute < 60; minute += 1) {
            for (let hour = 0; hour < 24; hour += 3) {
              const identity: HazardIdentity = {
                expression: `${minute} ${hour} * * *`,
                dialect,
                zone,
                intendedLocal: { year: 2024, month: 3, day: 10, hour, minute, second: 0 },
                kind,
              };
              const id = hazardId(identity);
              const canon = canonical(identity);
              const prior = seen.get(id);
              if (prior !== undefined && prior !== canon) {
                collisions += 1;
              }
              seen.set(id, canon);
              count += 1;
            }
          }
        }
      }
    }
    process.stdout.write(
      `\n[property] hazard-id corpus size=${count} distinctIds=${seen.size} collisions=${collisions}\n`,
    );
    expect(collisions).toBe(0);
    expect(seen.size).toBe(count);
  });

  test(`randomly generated distinct identities never map to the same id (seed 0x${SEED.toString(16)}, ${NUM_RUNS} runs)`, () => {
    const byId = new Map<string, string>();
    let collisions = 0;
    fc.assert(
      fc.property(identityArb, (identity) => {
        const id = hazardId(identity);
        const canon = canonical(identity);
        const prior = byId.get(id);
        if (prior !== undefined && prior !== canon) {
          collisions += 1;
        }
        byId.set(id, canon);
        // Same identity must always hash the same way.
        expect(hazardId(identity)).toBe(id);
      }),
      { seed: SEED, numRuns: NUM_RUNS, endOnFailure: true },
    );
    process.stdout.write(`\n[property] hazard-id random distinctIds=${byId.size} collisions=${collisions}\n`);
    expect(collisions).toBe(0);
  });
});
