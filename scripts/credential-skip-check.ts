/**
 * Runs the full test suite and enforces the credential-skip contract:
 * the number of tests that skipped for lack of a credential must equal
 * the number recorded in DECISIONS.md. If a test starts requiring a
 * secret (or stops), the count drifts and this fails until DECISIONS.md
 * is updated to match, so the hermetic job can never silently grow a
 * dependency on credentials. It is the command the hermetic CI job runs.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDENTIAL_SKIP_MARKER } from '../tests/support/credential-skip';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function expectedCount(): number {
  const decisions = readFileSync(path.join(REPO_ROOT, 'DECISIONS.md'), 'utf8');
  const match = /credential-skipped-tests:\s*(\d+)/.exec(decisions);
  if (match === null) {
    throw new Error('DECISIONS.md has no "credential-skipped-tests: <n>" line to check against');
  }
  return Number(match[1]);
}

function main(): number {
  const expected = expectedCount();
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--reporter=verbose'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TZ: 'UTC' },
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const actual = output.split('\n').filter((line) => line.includes(CREDENTIAL_SKIP_MARKER)).length;

  process.stdout.write(output);
  process.stdout.write(`\ncredential-skip check: expected ${expected}, found ${actual}\n`);

  if (run.status !== 0) {
    process.stderr.write('credential-skip check: the test suite did not pass\n');
    return 1;
  }
  if (actual !== expected) {
    process.stderr.write(
      `credential-skip check: count changed from ${expected} to ${actual}. ` +
        'Update the "credential-skipped-tests" line in DECISIONS.md with the reason.\n',
    );
    return 1;
  }
  process.stdout.write('credential-skip check: OK\n');
  return 0;
}

process.exitCode = main();
