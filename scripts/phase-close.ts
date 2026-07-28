/**
 * phase-close: the gate that decides whether a phase is complete. A phase
 * is done only when every one of six criteria holds on the exact SHA that
 * is checked out and pushed, not when a local evidence run happens to be
 * green. Each criterion is checked independently and reported by name;
 * there is no short-circuit, so the table always shows all six. Exit is 0
 * only when all six pass.
 *
 * Usage: pnpm phase:close <n>
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every child pid this run spawned, so criterion 6 can prove none survive. */
const spawnedPids: number[] = [];

interface Spawned {
  status: number;
  stdout: string;
  stderr: string;
}

/** Runs a command to completion, recording its pid for the orphan check. */
function run(command: string, args: string[]): Spawned {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TZ: 'UTC' },
  });
  if (typeof result.pid === 'number') {
    spawnedPids.push(result.pid);
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

interface Criterion {
  name: string;
  pass: boolean;
  detail: string;
  reproduce: string;
}

function git(args: string[]): string {
  return run('git', args).stdout.trim();
}

function ownerRepo(): string {
  const url = git(['remote', 'get-url', 'origin']);
  const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(url);
  if (match === null) {
    throw new Error(`cannot parse owner/repo from origin url: ${url}`);
  }
  return `${match[1]}/${match[2]}`;
}

/** 1. Working tree clean, no untracked files outside gitignore. */
function checkCleanTree(): Criterion {
  const porcelain = run('git', ['status', '--porcelain']).stdout.trim();
  return {
    name: 'clean-working-tree',
    pass: porcelain === '',
    detail: porcelain === '' ? 'no changes, no untracked files' : `dirty:\n${porcelain}`,
    reproduce: 'git status --porcelain',
  };
}

/** 2. HEAD is pushed and the local and remote SHAs match. */
function checkPushed(headSha: string, branch: string): Criterion {
  const lsRemote = run('git', ['ls-remote', 'origin', `refs/heads/${branch}`]).stdout.trim();
  const remoteSha = lsRemote.split(/\s+/)[0] ?? '';
  const pass = remoteSha !== '' && remoteSha === headSha;
  return {
    name: 'head-pushed-and-matches-remote',
    pass,
    detail: pass
      ? `local and origin/${branch} both at ${headSha.slice(0, 12)}`
      : `local ${headSha.slice(0, 12)} vs origin/${branch} ${remoteSha.slice(0, 12) || '(absent)'}`,
    reproduce: `git rev-parse HEAD; git ls-remote origin refs/heads/${branch}`,
  };
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/** 3. CI on that exact SHA concluded, and every check run concluded success. */
function checkCi(headSha: string, repo: string): Criterion {
  const reproduce = `gh api /repos/${repo}/commits/${headSha}/check-runs`;
  const result = run('gh', ['api', `/repos/${repo}/commits/${headSha}/check-runs`, '--paginate']);
  if (result.status !== 0) {
    return {
      name: 'ci-green-on-this-sha',
      pass: false,
      detail: `checks API call failed: ${result.stderr.trim().split('\n')[0] ?? 'unknown error'}`,
      reproduce,
    };
  }
  let runs: CheckRun[];
  try {
    const parsed = JSON.parse(result.stdout) as { check_runs?: CheckRun[] };
    runs = parsed.check_runs ?? [];
  } catch {
    return { name: 'ci-green-on-this-sha', pass: false, detail: 'could not parse checks API response', reproduce };
  }
  if (runs.length === 0) {
    return {
      name: 'ci-green-on-this-sha',
      pass: false,
      detail: `no check runs exist for ${headSha.slice(0, 12)} (missing checks is a fail)`,
      reproduce,
    };
  }
  const notDone = runs.filter((r) => r.status !== 'completed');
  const failed = runs.filter((r) => r.status === 'completed' && r.conclusion !== 'success');
  const pass = notDone.length === 0 && failed.length === 0;
  const parts = [`${runs.length} check run(s)`];
  if (notDone.length > 0) {
    parts.push(`in progress: ${notDone.map((r) => r.name).join(', ')}`);
  }
  if (failed.length > 0) {
    parts.push(`not success: ${failed.map((r) => `${r.name}=${r.conclusion ?? 'null'}`).join(', ')}`);
  }
  if (pass) {
    parts.push('all success');
  }
  return { name: 'ci-green-on-this-sha', pass, detail: parts.join('; '), reproduce };
}

/** 4. EVIDENCE.md regenerates byte-identically on that SHA. */
function checkEvidence(): Criterion {
  const result = run('pnpm', ['exec', 'tsx', 'scripts/evidence.ts', '--check']);
  const pass = result.status === 0;
  const lastLine = (result.stderr.trim().split('\n').pop() ?? '').trim();
  return {
    name: 'evidence-byte-identical',
    pass,
    detail: pass ? 'EVIDENCE.md matches regenerated output' : lastLine || 'evidence:check exited nonzero',
    reproduce: 'pnpm evidence:check',
  };
}

/** 5. The acceptance assertions for phase n pass. */
function checkAcceptance(phase: number): Criterion {
  const file = `test/acceptance/phase-${phase}.test.ts`;
  const reproduce = `pnpm exec vitest run ${file}`;
  if (!existsSync(path.join(REPO_ROOT, file))) {
    return {
      name: 'acceptance-tests-pass',
      pass: false,
      detail: `${file} does not exist (acceptance criteria for phase ${phase} are not encoded)`,
      reproduce,
    };
  }
  const result = run('pnpm', ['exec', 'vitest', 'run', file]);
  return {
    name: 'acceptance-tests-pass',
    pass: result.status === 0,
    detail: result.status === 0 ? `${file} passed` : `${file} failed (see reproduce command)`,
    reproduce,
  };
}

/**
 * 6. No orphaned child processes survive the run. Every command the gate
 * spawns is tracked; each must have exited by the time this runs (all
 * spawns are synchronous, so a survivor means a command detached a
 * background process). Runtime helpers of this script itself (for example
 * the esbuild service tsx keeps alive) are not gate-spawned commands and
 * are correctly not tracked here.
 */
function checkNoOrphans(): Criterion {
  const survivors = spawnedPids.filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
  const pass = survivors.length === 0;
  return {
    name: 'no-orphaned-processes',
    pass,
    detail: pass
      ? `all ${spawnedPids.length} spawned commands exited`
      : `still alive: ${survivors.join(', ')}`,
    reproduce: survivors.length === 0 ? 'ps -o pid,cmd -p <pid>' : `ps -o pid,cmd -p ${survivors.join(',')}`,
  };
}

function printTable(phase: number, headSha: string, criteria: Criterion[]): void {
  const allPass = criteria.every((c) => c.pass);
  process.stdout.write(`\nphase-close ${phase}  sha ${headSha.slice(0, 12)}  ${allPass ? 'PASS' : 'FAIL'}\n\n`);
  const nameWidth = Math.max(...criteria.map((c) => c.name.length));
  criteria.forEach((c, index) => {
    const mark = c.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`  ${index + 1}. ${mark}  ${c.name.padEnd(nameWidth)}  ${c.detail.split('\n')[0] ?? ''}\n`);
  });
  const failed = criteria.filter((c) => !c.pass);
  if (failed.length > 0) {
    process.stdout.write('\nfailing criteria and how to reproduce:\n');
    for (const c of failed) {
      process.stdout.write(`  - ${c.name}: ${c.detail}\n    reproduce: ${c.reproduce}\n`);
    }
  }
}

function main(): number {
  const raw = process.argv[2];
  const phase = Number(raw);
  if (raw === undefined || !Number.isInteger(phase) || phase <= 0) {
    process.stderr.write('usage: pnpm phase:close <n>  (n is a positive integer phase number)\n');
    return 2;
  }
  const headSha = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const repo = ownerRepo();

  const criteria: Criterion[] = [
    checkCleanTree(),
    checkPushed(headSha, branch),
    checkCi(headSha, repo),
    checkEvidence(),
    checkAcceptance(phase),
    checkNoOrphans(),
  ];

  printTable(phase, headSha, criteria);
  return criteria.every((c) => c.pass) ? 0 : 1;
}

process.exitCode = main();
