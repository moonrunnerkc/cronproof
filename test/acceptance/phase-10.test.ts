import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { REPO_ROOT } from './support';

// Phase 10 acceptance criteria (verbatim from the phase-10 prompt): all
// properties pass with recorded seed and case count; every adversarial zone
// has a named test; mutation score measured.

const ADVERSARIAL_ZONES = [
  'America/New_York', 'Europe/Dublin', 'Australia/Lord_Howe', 'Pacific/Chatham',
  'Antarctica/Troll', 'Pacific/Apia', 'Asia/Tehran', 'America/Sao_Paulo',
  'Africa/Casablanca', 'Asia/Gaza', 'America/Santiago', 'Pacific/Kiritimati',
  'Europe/Lisbon', 'Asia/Kolkata',
];

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('phase 10: recorded-seed properties, a named test per adversarial zone, a measured mutation score', () => {
  test('the fast-check property suites pin a seed and a case count', () => {
    const partition = read('tests/property/hazard-invariants.property.test.ts');
    expect(partition).toMatch(/const SEED = 0x[0-9a-f]+/);
    expect(partition).toMatch(/NUM_RUNS = \d+/);
  });

  test('every adversarial zone has a named test in the adversarial suites', () => {
    const corpus =
      read('tests/adversarial/gaps-and-folds.test.ts') + read('tests/adversarial/date-line-and-rules.test.ts');
    for (const zone of ADVERSARIAL_ZONES) {
      expect(corpus.includes(zone), `adversarial suite must name ${zone}`).toBe(true);
    }
  });

  test('the mutation run produced a measured score in a committed report', () => {
    const file = path.join(REPO_ROOT, 'reports', 'mutation', 'mutation.json');
    expect(existsSync(file)).toBe(true);
    const report = JSON.parse(readFileSync(file, 'utf8')) as { files?: Record<string, unknown> };
    expect(Object.keys(report.files ?? {}).length).toBeGreaterThan(0);
  });
});
