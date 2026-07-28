import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCANNER = path.join(REPO_ROOT, 'scripts', 'import-surface-scan.ts');

let stubDir: string;

beforeAll(() => {
  // A stub `gh` that returns no token, shadowing any real gh on PATH, so a
  // module that shells out for a credential at import fails deterministically
  // here regardless of the developer's authentication state.
  stubDir = mkdtempSync(path.join(tmpdir(), 'import-surface-gh-'));
  const gh = path.join(stubDir, 'gh');
  writeFileSync(gh, '#!/bin/sh\nexit 1\n');
  chmodSync(gh, 0o755);
});

afterAll(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

function runScannerScrubbed(): { status: number; output: string } {
  const scrubbedEnv: NodeJS.ProcessEnv = { ...process.env };
  delete scrubbedEnv.GITHUB_TOKEN;
  delete scrubbedEnv.GH_TOKEN;
  delete scrubbedEnv.GH_ENTERPRISE_TOKEN;
  scrubbedEnv.PATH = `${stubDir}${path.delimiter}${process.env.PATH ?? ''}`;
  scrubbedEnv.TZ = 'UTC';
  const result = spawnSync(process.execPath, ['--import', 'tsx', SCANNER], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: scrubbedEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('every library module imports cleanly in a scrubbed, offline, unauthenticated process', () => {
  test('importing all of src/ and research/src/ throws nothing and opens no network connection', () => {
    const { status, output } = runScannerScrubbed();
    expect(output, output).toContain('0 failed');
    expect(output).not.toContain('FAIL ');
    expect(status, `scanner exited ${status}\n${output}`).toBe(0);
  }, 60_000);
});
