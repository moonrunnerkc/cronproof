import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { invoke } from '../../tests/cli/helper';

// Phase 9 built the CI gate and composite action. Criteria reconstructed
// from the phase-9 DECISIONS entries and the README exit-code table: the
// scan gate fails on hazards at or above the threshold, a wrong tzdb pin
// fails with exit 3, and a baseline suppresses known hazards.

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cronproof-phase9-'));
  writeFileSync(path.join(dir, 'app.crontab'), 'CRON_TZ=Europe/Berlin\n30 2 * * * /usr/bin/backup\n', 'utf8');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('phase 9: the scan gate fails on hazards, on a wrong tzdb pin, and passes with a baseline', () => {
  test('a spring-forward and fall-back schedule fails the gate with exit 1', () => {
    const { exit } = invoke(['scan', dir, '--fail-on', 'high']);
    expect(exit).toBe(1);
  });

  test('a wrong tzdb pin fails with the internal exit code 3', () => {
    const { exit } = invoke(['scan', dir, '--tzdb-check', '1999z']);
    expect(exit).toBe(3);
  });

  test('a baseline of the known hazards lets a later scan pass with exit 0', () => {
    const baseline = path.join(dir, 'baseline.json');
    const written = invoke(['baseline', dir, '--out', baseline]);
    expect(written.exit).toBe(0);
    const gated = invoke(['scan', dir, '--baseline', baseline, '--fail-on', 'high']);
    expect(gated.exit).toBe(0);
  });
});
