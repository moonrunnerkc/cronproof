/**
 * Evidence for the repository scanner: the human-format `scan` output
 * against the fixture repo that carries every supported source type,
 * with a file, line, and column for each finding. Runs the dispatcher
 * in-process so it needs no build and no network, which keeps the
 * evidence run hermetic. The real-public-repo run lives in
 * scripts/real-repo-scan.ts (it needs network) and is recorded in
 * DECISIONS.md.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchCli } from '../src/cli/index';
import { readOwnVersion } from '../src/cli-main';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'scan', 'fixture');

function capture(argv: string[], version: string): { stdout: string; exit: number } {
  let stdout = '';
  const exit = dispatchCli({
    argv,
    writeOut: (text) => {
      stdout += text;
    },
    writeError: (text) => {
      stdout += text;
    },
    isTty: false,
    version,
  });
  return { stdout, exit };
}

async function main(): Promise<number> {
  const version = await readOwnVersion();
  process.stdout.write('== cronproof scan, fixture repo, human format ==\n\n');
  const human = capture(['scan', FIXTURE], version);
  // The fixture path is machine-specific; strip it so the output is
  // reproducible across checkouts and comparable in evidence:check.
  process.stdout.write(human.stdout.split(`${FIXTURE}/`).join('').split(FIXTURE).join('.'));
  process.stdout.write(`\nexit code: ${human.exit}\n`);
  return 0;
}

process.exitCode = await main();
