import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { readBaseline, splitByBaseline, writeBaseline } from '../../src/cli/baseline';
import type { HazardView } from '../../src/cli/types';

const dir = mkdtempSync(path.join(tmpdir(), 'cronproof-baseline-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function hazard(id: string): HazardView {
  return {
    id,
    kind: 'SKIPPED',
    severity: 'high',
    zone: 'Europe/Berlin',
    expression: '30 2 * * *',
    localIso: '2025-03-30T02:30:00',
    instantsUtc: [],
    message: 'skipped',
  };
}

describe('baseline files', () => {
  test('writing then reading returns the same ids, sorted and de-duplicated', () => {
    const file = path.join(dir, 'roundtrip.json');
    const written = writeBaseline(file, ['hz_c', 'hz_a', 'hz_a', 'hz_b']);
    expect(written).toBe(3);
    const ids = readBaseline(file);
    expect([...ids].sort()).toEqual(['hz_a', 'hz_b', 'hz_c']);
  });

  test('reading a nonexistent baseline throws a message that says how to make one', () => {
    expect(() => readBaseline(path.join(dir, 'missing.json'))).toThrow(/cronproof baseline/);
  });

  test('splitByBaseline sends baselined ids to accepted and the rest to active', () => {
    const baseline = new Set(['hz_known']);
    const split = splitByBaseline([hazard('hz_known'), hazard('hz_new')], baseline);
    expect(split.baselined.map((h) => h.id)).toEqual(['hz_known']);
    expect(split.active.map((h) => h.id)).toEqual(['hz_new']);
  });
});
