import fc from 'fast-check';
import { beforeAll, describe, expect, test } from 'vitest';
import { enumerate, parse, type CronAst, type LocalFiring } from '../../src/cron/index';
import { classifyHazards, isIntervalLike } from '../../src/hazard/index';
import { enumerateFirings, resolveFirings } from '../../src/hazard/resolve-firings';
import {
  createTzifBackend,
  daysFromCivil,
  vendoredZoneinfoRoot,
  type TzifBackend,
} from '../../src/tz/index';
import { addDays, cronExpressionArb, HAZARD_ZONES, midnight, sortedKeys, windowArb } from './support';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;

const SEED = 0x1a2b3c4d;
const NUM_RUNS = 300;
const CONFIG = { seed: SEED, numRuns: NUM_RUNS, endOnFailure: true } as const;

let backend: TzifBackend;
beforeAll(() => {
  backend = createTzifBackend({ zoneinfoRoot: ROOT });
});

function astOf(source: string): CronAst {
  const parsed = parse(source, 'vixie');
  if (!parsed.ok) {
    throw new Error(`generated expression did not parse: "${source}"`);
  }
  return parsed.ast;
}

function instantCount(kind: 'unique' | 'nonexistent' | 'ambiguous'): number {
  return kind === 'unique' ? 1 : kind === 'ambiguous' ? 2 : 0;
}

describe('per-firing classification is a partition and the resolved-count invariant holds', () => {
  test(`every firing is unique, skipped, or doubled, exactly one of the three, and resolved = intended - skipped + doubled (seed 0x${SEED.toString(16)}, ${NUM_RUNS} runs)`, () => {
    let firingsSeen = 0;
    let skippedSeen = 0;
    let doubledSeen = 0;
    // Explicit cases guarantee the corpus exercises a real skip and a
    // real double, on both the interval-like and point-schedule paths,
    // so the coverage floor below is deterministic and cannot flake.
    const NY = 'America/New_York';
    const examples: [string, string, { from: LocalFiring; to: LocalFiring }][] = [
      ['* 2 * * *', NY, { from: midnight(2024, 3, 10), to: midnight(2024, 3, 11) }],
      ['* 1 * * *', NY, { from: midnight(2024, 11, 3), to: midnight(2024, 11, 4) }],
      ['30 2 * * *', NY, { from: midnight(2024, 3, 10), to: midnight(2024, 3, 11) }],
      ['30 1 * * *', NY, { from: midnight(2024, 11, 3), to: midnight(2024, 11, 4) }],
    ];
    fc.assert(
      fc.property(cronExpressionArb(), fc.constantFrom(...HAZARD_ZONES), windowArb(4), (source, zone, window) => {
        const ast = astOf(source);
        const firings = enumerateFirings(ast, zone, window.from, window.to);
        const resolved = resolveFirings(firings, zone, backend);

        let unique = 0;
        let skipped = 0;
        let doubled = 0;
        let totalInstants = 0;
        for (const firing of resolved) {
          const kind = firing.resolution.kind;
          if (kind === 'unique') unique += 1;
          else if (kind === 'nonexistent') skipped += 1;
          else doubled += 1;
          totalInstants += instantCount(kind);
        }
        // Partition: the three disjoint buckets cover every firing.
        expect(unique + skipped + doubled).toBe(firings.length);
        // The invariant the phase names, in resolved-instant terms.
        expect(totalInstants).toBe(firings.length - skipped + doubled);

        // For point schedules the classifier's per-firing hazards must
        // match the resolution buckets exactly: SKIPPED with nonexistent,
        // DOUBLED with ambiguous, and neither with anything else.
        if (!isIntervalLike(ast)) {
          const hazards = classifyHazards(ast, backend, {
            expression: source,
            dialect: 'vixie',
            zone,
            from: window.from,
            to: window.to,
          });
          const skippedHz = hazards.filter((h) => h.kind === 'SKIPPED');
          const doubledHz = hazards.filter((h) => h.kind === 'DOUBLED');
          expect(skippedHz.length).toBe(skipped);
          expect(doubledHz.length).toBe(doubled);
          for (const hz of skippedHz) {
            const match = resolved.find(
              (r) =>
                r.local.year === hz.intendedLocal.year &&
                r.local.month === hz.intendedLocal.month &&
                r.local.day === hz.intendedLocal.day &&
                r.local.hour === hz.intendedLocal.hour &&
                r.local.minute === hz.intendedLocal.minute &&
                r.local.second === hz.intendedLocal.second,
            );
            expect(match?.resolution.kind).toBe('nonexistent');
          }
        }

        firingsSeen += firings.length;
        skippedSeen += skipped;
        doubledSeen += doubled;
      }),
      { ...CONFIG, examples },
    );
    process.stdout.write(
      `\n[property] partition seed=0x${SEED.toString(16)} runs=${NUM_RUNS} ` +
        `firings=${firingsSeen} skipped=${skippedSeen} doubled=${doubledSeen}\n`,
    );
    // The corpus must actually exercise skips and doubles, or the
    // partition claim is vacuous. This is a lower bound on coverage,
    // not a pinned count: the seed is fixed so it cannot flake.
    expect(skippedSeen).toBeGreaterThan(0);
    expect(doubledSeen).toBeGreaterThan(0);
  }, 120_000);
});

describe('enumeration is independent of traversal direction', () => {
  test(`unioning per-day slices in reverse day order yields the same firing set as one forward pass (seed 0x${SEED.toString(16)})`, () => {
    fc.assert(
      fc.property(cronExpressionArb(), windowArb(21), (source, window) => {
        const ast = astOf(source);
        const forward = enumerate(ast, { zone: 'UTC', from: window.from, to: window.to });

        const dayCount =
          daysFromCivil(window.to.year, window.to.month, window.to.day) -
          daysFromCivil(window.from.year, window.from.month, window.from.day);
        const reverseUnion: typeof forward = [];
        for (let i = dayCount - 1; i >= 0; i -= 1) {
          const dayFrom = addDays(window.from, i);
          const dayTo = addDays(window.from, i + 1);
          reverseUnion.push(...enumerate(ast, { zone: 'UTC', from: dayFrom, to: dayTo }));
        }
        expect(sortedKeys(reverseUnion)).toEqual(sortedKeys(forward));
      }),
      CONFIG,
    );
  }, 60_000);
});

describe('UTC never produces a hazard', () => {
  test(`classifyHazards in UTC is empty for every generated expression and window (seed 0x${SEED.toString(16)}, ${NUM_RUNS} runs)`, () => {
    fc.assert(
      fc.property(cronExpressionArb(), windowArb(6), (source, window) => {
        const ast = astOf(source);
        const hazards = classifyHazards(ast, backend, {
          expression: source,
          dialect: 'vixie',
          zone: 'UTC',
          from: window.from,
          to: window.to,
          zoneinfoRoot: ROOT,
        });
        expect(hazards).toEqual([]);
      }),
      CONFIG,
    );
  }, 60_000);
});
