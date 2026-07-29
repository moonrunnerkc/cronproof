import { describe, expect, test } from 'vitest';
import { createIntlBackend, crossCheckZone, resolveWallClock } from '../../src/tz/index';
import { backend } from './support';

// Phase 2 built the dual-backend timezone engine. Criteria reconstructed
// from the phase-2 DECISIONS entries: two independent backends that agree
// on every transition, and a three-way wall-clock resolution.

const intl = createIntlBackend();

describe('phase 2: two independent timezone backends that agree, and a three-way resolution', () => {
  test('a wall-clock time resolves as unique, nonexistent, or ambiguous', () => {
    const unique = resolveWallClock({ year: 2024, month: 1, day: 15, hour: 12, minute: 0 }, 'America/New_York', backend);
    const gap = resolveWallClock({ year: 2024, month: 3, day: 10, hour: 2, minute: 30 }, 'America/New_York', backend);
    const fold = resolveWallClock({ year: 2024, month: 11, day: 3, hour: 1, minute: 30 }, 'America/New_York', backend);
    expect(unique.kind).toBe('unique');
    expect(gap.kind).toBe('nonexistent');
    expect(fold.kind).toBe('ambiguous');
  });

  test('the Intl and TZif backends agree on every transition for a hazard-heavy zone, 1970 to 2040', () => {
    const result = crossCheckZone(intl, backend, 'America/New_York', Date.UTC(1970, 0, 1), Date.UTC(2040, 0, 1));
    expect(result.disagreements).toEqual([]);
    expect(result.transitionsCompared).toBeGreaterThan(100);
  });
});
