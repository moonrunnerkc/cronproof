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

/** A zoneinfo root whose declared tzdb release cannot match the runtime ICU. */
function mismatchedRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'cronproof-mismatch-'));
  cpSync(path.join(vendorRoot as string, 'Europe'), path.join(root, 'Europe'), { recursive: true });
  writeFileSync(path.join(root, '+VERSION'), '0000zzz\n');
  return root;
}

const root = mismatchedRoot();

/** One invocation per command, each otherwise valid, all reading the mismatched root. */
const INVOCATIONS: [string, string[]][] = [
  ['check', ['check', '30 2 * * *', '--tz', 'Europe/Berlin', '--from', '2023-10-28', '--to', '2023-10-30']],
  ['explain', ['explain', '30 2 * * *', '--tz', 'Europe/Berlin', '--at', '2023-10-29T00:30:00Z']],
  ['zones', ['zones', '--hazard-window', '2023-10-28..2023-10-30']],
  ['scan', ['scan', 'tests/ci/fixture']],
  ['baseline', ['baseline', 'tests/ci/fixture', '--out', path.join(root, 'baseline.json')]],
];

describe('a stale tzdb stops every command, not just the ones that take a zone', () => {
  test.each(INVOCATIONS)('%s refuses to answer and names both releases', (_name, argv) => {
    const run = invoke([...argv, '--zoneinfo-root', root]);
    expect(run.exit).toBe(3);
    expect(run.stdout).toContain('tzdb mismatch');
    expect(run.stdout).toContain('0000zzz');
  });

  test('the refusal still carries a receipt naming both tzdb sources', () => {
    const run = invoke(['scan', 'tests/ci/fixture', '--zoneinfo-root', root, '--format', 'json']);
    const parsed = JSON.parse(run.stdout) as {
      receipt: { tzdbIntl: string; tzdbZoneinfo: string };
      data: { verificationFailure: string };
    };
    expect(parsed.receipt.tzdbZoneinfo).toBe('0000zzz');
    expect(parsed.receipt.tzdbIntl).not.toBe('0000zzz');
    expect(parsed.data.verificationFailure).toContain('tzdb mismatch');
  });

  test('a scan against a matching root reports hazards instead of refusing', () => {
    const run = invoke(['scan', 'tests/ci/fixture', '--fail-on', 'high']);
    expect(run.exit).toBe(1);
    expect(run.stdout).not.toContain('tzdb mismatch');
  });
});
