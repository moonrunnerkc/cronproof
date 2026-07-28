import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  createIntlBackend,
  createTzifBackend,
  crossCheckZone,
  listZones,
  vendoredZoneinfoRoot,
} from '../../src/tz/index';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;

const SEED = 0x5eed7a11;
const OFFSET_RUNS = 5_000;
const WINDOW_RUNS = 400;

const intl = createIntlBackend();
const tzif = createTzifBackend({ zoneinfoRoot: ROOT });

const DAY_MS = 86_400_000;
const START_DAY = Math.trunc(Date.UTC(1970, 0, 1) / DAY_MS);
const END_DAY = Math.trunc(Date.UTC(2040, 0, 1) / DAY_MS);

/**
 * Every vendored zone the Intl backend can also name on this runtime.
 * The one exclusion in the vendored 2025b set is "Factory", which the
 * ICU tzdb does not expose; excluding it keeps a disagreement a real
 * finding rather than a naming artifact.
 */
const ZONES: string[] = listZones(ROOT).filter((zone) => {
  try {
    intl.offsetAt(Date.UTC(2024, 0, 1), zone);
    return true;
  } catch {
    return false;
  }
});

if (ZONES.length < 100) {
  throw new Error(`expected the full vendored zone set, got only ${ZONES.length} zones`);
}

const instantArb = fc
  .tuple(fc.integer({ min: START_DAY, max: END_DAY }), fc.integer({ min: 0, max: DAY_MS - 1 }))
  .map(([day, intraday]) => day * DAY_MS + intraday);

describe('the two timezone backends never disagree', () => {
  test(`the Intl and TZif backends report the same UTC offset at random instants across all ${ZONES.length} zones (seed 0x${SEED.toString(16)}, ${OFFSET_RUNS} runs)`, () => {
    fc.assert(
      fc.property(fc.constantFrom(...ZONES), instantArb, (zone, instant) => {
        const a = intl.offsetAt(instant, zone).offsetSeconds;
        const b = tzif.offsetAt(instant, zone).offsetSeconds;
        expect(b, `offset mismatch in ${zone} at ${new Date(instant).toISOString()}`).toBe(a);
      }),
      { seed: SEED, numRuns: OFFSET_RUNS, endOnFailure: true },
    );
  }, 120_000);

  test(`crossCheckZone finds zero transition disagreements over random windows and zones (seed 0x${SEED.toString(16)}, ${WINDOW_RUNS} runs)`, () => {
    const spanArb = fc.integer({ min: 30, max: 730 });
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc.integer({ min: START_DAY, max: END_DAY - 730 }),
        spanArb,
        (zone, startDay, span) => {
          const start = startDay * DAY_MS;
          const end = (startDay + span) * DAY_MS;
          const result = crossCheckZone(intl, tzif, zone, start, end);
          expect(result.disagreements, `disagreement in ${zone}`).toEqual([]);
        },
      ),
      { seed: SEED, numRuns: WINDOW_RUNS, endOnFailure: true },
    );
  }, 120_000);
});
