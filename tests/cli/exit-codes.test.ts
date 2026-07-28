import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { vendoredZoneinfoRoot } from '../../src/tz/index';
import { invoke } from './helper';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}

/** A zoneinfo root whose declared tzdb version cannot match the runtime ICU. */
function mismatchedRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cronproof-badtz-'));
  cpSync(path.join(vendorRoot as string, 'Europe'), path.join(root, 'Europe'), { recursive: true });
  writeFileSync(path.join(root, '+VERSION'), '0000zzz\n');
  return root;
}

const YEAR = ['--from', '2023-01-01', '--to', '2024-01-01'];
const FALL = ['--from', '2023-10-28', '--to', '2023-10-30'];

describe('exit codes are a contract, asserted for every value', () => {
  test('0: a schedule with no hazards at or above the threshold', () => {
    expect(invoke(['check', '0 4 * * *', '--tz', 'Europe/Berlin', ...YEAR]).exit).toBe(0);
  });

  test('1: a hazard at or above --fail-on (a critical DOUBLED, default fail-on high)', () => {
    expect(invoke(['check', '30 2 * * *', '--tz', 'Europe/Berlin', ...FALL]).exit).toBe(1);
  });

  test('1 is threshold-sensitive: a medium INTERVAL_DRIFT passes at high but fails at medium', () => {
    const drift = ['check', '*/15 * * * *', '--tz', 'America/New_York', '--from', '2024-01-01', '--to', '2025-01-01'];
    expect(invoke([...drift]).exit).toBe(0);
    expect(invoke([...drift, '--fail-on', 'medium']).exit).toBe(1);
  });

  test('2: an out-of-range expression is a parse error', () => {
    expect(invoke(['check', '99 2 * * *', '--tz', 'Europe/Berlin', ...YEAR]).exit).toBe(2);
  });

  test('2: missing required options', () => {
    expect(invoke(['check', '30 2 * * *']).exit).toBe(2);
  });

  test('2: an unknown command or format', () => {
    expect(invoke(['frobnicate']).exit).toBe(2);
    expect(invoke(['check', '0 4 * * *', '--tz', 'UTC', ...YEAR, '--format', 'yaml']).exit).toBe(2);
  });

  test('3: an internal verification failure (tzdb mismatch)', () => {
    const run = invoke(['check', '30 2 * * *', '--tz', 'Europe/Berlin', ...FALL, '--zoneinfo-root', mismatchedRoot()]);
    expect(run.exit).toBe(3);
    expect(run.stdout).toContain('tzdb mismatch');
  });
});
