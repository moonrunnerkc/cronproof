/**
 * Acceptance evidence that the scanner runs on a real public repository
 * without crashing. Fetches one repo pinned to an exact SHA into a
 * temp dir, scans it, and prints the repo, the SHA, and a summary plus
 * a sample of findings. Pinning the SHA makes the run deterministic;
 * it needs network, so it is a standalone script rather than part of
 * the hermetic `npm run evidence` set.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanRepo } from '../src/scan/index';

const REPO_URL = 'https://github.com/harrisiirak/cron-parser.git';
const REPO_SHA = 'aeb2a1513fd33365a6414f4137516c9482f831ed';

function git(cwd: string, args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

function fetchPinned(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'cronproof-realrepo-'));
  git(dir, ['init', '-q']);
  git(dir, ['remote', 'add', 'origin', REPO_URL]);
  git(dir, ['fetch', '-q', '--depth', '1', 'origin', REPO_SHA]);
  git(dir, ['checkout', '-q', REPO_SHA]);
  return dir;
}

function main(): number {
  process.stdout.write('== cronproof scan, real public repo, pinned SHA ==\n\n');
  process.stdout.write(`repo: ${REPO_URL}\n`);
  process.stdout.write(`sha:  ${REPO_SHA}\n\n`);
  let dir: string | null = null;
  try {
    dir = fetchPinned();
    const result = scanRepo(dir);
    const byKind: Record<string, number> = {};
    for (const finding of result.findings) {
      byKind[finding.sourceKind] = (byKind[finding.sourceKind] ?? 0) + 1;
    }
    process.stdout.write(`files scanned: ${result.filesScanned}\n`);
    process.stdout.write(`findings:      ${result.findings.length}\n`);
    process.stdout.write(`diagnostics:   ${result.diagnostics.length}\n`);
    process.stdout.write(`by source kind: ${JSON.stringify(byKind)}\n\n`);
    process.stdout.write('first five findings (path relative to the checkout):\n');
    for (const finding of result.findings.slice(0, 5)) {
      const expr = finding.resolution === 'unresolved' ? 'UNRESOLVED' : finding.expression;
      process.stdout.write(`  ${finding.file}:${finding.line}:${finding.column} [${finding.sourceKind}] ${JSON.stringify(expr)}\n`);
    }
    process.stdout.write('\nresult: scanned without crashing\n');
    return 0;
  } catch (error) {
    process.stderr.write(`real-repo scan failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    if (dir !== null) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

process.exitCode = main();
