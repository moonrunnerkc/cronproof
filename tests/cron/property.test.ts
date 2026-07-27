import { describe, expect, test } from 'vitest';
import { enumerate, parse } from '../../src/cron/index';
import type { LocalFiring, WallClock } from '../../src/cron/index';

/** Deterministic PRNG (mulberry32) so the 10,000 cases reproduce exactly. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x0c0ffee5;
const CASE_COUNT = 10_000;

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Generates one valid field within [min, max] as cron source text. */
function randomField(rng: () => number, min: number, max: number): string {
  const form = randInt(rng, 0, 5);
  if (form === 0) {
    return '*';
  }
  if (form === 1) {
    return String(randInt(rng, min, max));
  }
  if (form === 2) {
    return `*/${randInt(rng, 1, Math.max(2, Math.floor((max - min) / 2)))}`;
  }
  if (form === 3) {
    const a = randInt(rng, min, max);
    const b = randInt(rng, a, max);
    return `${a}-${b}`;
  }
  if (form === 4) {
    const a = randInt(rng, min, max);
    const b = randInt(rng, a, max);
    const step = randInt(rng, 1, Math.max(1, b - a) || 1);
    return `${a}-${b}/${step}`;
  }
  const count = randInt(rng, 2, 3);
  const parts: number[] = [];
  for (let i = 0; i < count; i += 1) {
    parts.push(randInt(rng, min, max));
  }
  return parts.join(',');
}

function randomExpression(rng: () => number): string {
  return [
    randomField(rng, 0, 59),
    randomField(rng, 0, 23),
    randomField(rng, 1, 31),
    randomField(rng, 1, 12),
    randomField(rng, 0, 6),
  ].join(' ');
}

function compare(a: LocalFiring, b: LocalFiring): number {
  return (
    a.year - b.year ||
    a.month - b.month ||
    a.day - b.day ||
    a.hour - b.hour ||
    a.minute - b.minute ||
    a.second - b.second
  );
}

describe('randomly generated valid expressions', () => {
  test(`enumerate deterministically and in strict wall-clock order over a one-year window (seed 0x${SEED.toString(16)}, ${CASE_COUNT} cases)`, () => {
    const rng = mulberry32(SEED);
    const from: WallClock = { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    const to: WallClock = { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    let parsed = 0;
    let totalFirings = 0;

    for (let i = 0; i < CASE_COUNT; i += 1) {
      const source = randomExpression(rng);
      const result = parse(source, 'vixie');
      expect(result.ok, `generated expression should be valid: "${source}"`).toBe(true);
      if (!result.ok) {
        continue;
      }
      parsed += 1;
      const first = enumerate(result.ast, { zone: 'UTC', from, to, limit: 128 });
      const second = enumerate(result.ast, { zone: 'UTC', from, to, limit: 128 });
      expect(second, `enumeration must be deterministic for "${source}"`).toEqual(first);
      for (let k = 1; k < first.length; k += 1) {
        const prev = first[k - 1];
        const cur = first[k];
        if (prev === undefined || cur === undefined) {
          continue;
        }
        expect(compare(prev, cur), `firings must strictly increase for "${source}"`).toBeLessThan(0);
      }
      totalFirings += first.length;
    }

    expect(parsed).toBe(CASE_COUNT);
    // A stable fingerprint of the run, printed so evidence records it.
    // Pinning it makes "deterministic across runs" a hard assertion:
    // the exact seed must reproduce the exact total on every run.
    process.stdout.write(`\n[property] seed=0x${SEED.toString(16)} cases=${CASE_COUNT} parsed=${parsed} totalFirings=${totalFirings}\n`);
    expect(totalFirings).toBe(1_084_685);
  }, 60_000);
});
