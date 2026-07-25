import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  firstDifference,
  normalizeEvidence,
  renderEvidence,
  type CommandResult,
  type CommandSpec,
  type RunMetadata,
} from './evidence-lib';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const EVIDENCE_PATH = path.join(REPO_ROOT, 'EVIDENCE.md');

const COMMANDS: CommandSpec[] = [
  { title: 'lint', command: 'pnpm', args: ['run', 'lint'] },
  { title: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { title: 'test (with coverage)', command: 'pnpm', args: ['run', 'test'] },
  {
    title: 'tz cross-check, all zones, 1970 to 2040, vendored root matching the Intl tzdb release',
    command: 'pnpm',
    args: ['run', 'crosscheck', '--root', 'vendor/zoneinfo'],
  },
  { title: 'build', command: 'pnpm', args: ['run', 'build'] },
  {
    title: 'CLI smoke',
    command: 'node',
    args: ['dist/cli.js', '--version'],
  },
];

function runCommand(spec: CommandSpec): CommandResult {
  const spawned = spawnSync(spec.command, spec.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      TZ: 'UTC',
    },
  });
  return {
    title: spec.title,
    commandLine: [spec.command, ...spec.args].join(' '),
    exitCode: spawned.status ?? -1,
    stdout: spawned.stdout ?? '',
    stderr:
      spawned.error === undefined
        ? (spawned.stderr ?? '')
        : `${spawned.stderr ?? ''}\nspawn error: ${spawned.error.message}`,
  };
}

function readGit(args: string[]): string | null {
  const spawned = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return spawned.status === 0 ? spawned.stdout.trim() : null;
}

function collectMetadata(): RunMetadata {
  const status = readGit(['status', '--porcelain']);
  return {
    generatedAt: new Date().toISOString(),
    gitSha: readGit(['rev-parse', 'HEAD']) ?? 'no commits yet',
    workingTreeDirty: status === null ? true : status.length > 0,
    repoRoot: REPO_ROOT,
    nodeVersion: process.version,
    icuVersion: process.versions.icu ?? 'unknown',
    tzdbVersion: process.versions.tz ?? 'unknown',
  };
}

function generate(): { document: string; worstExitCode: number } {
  const results = COMMANDS.map((spec) => {
    process.stderr.write(`[evidence] running: ${spec.title}\n`);
    const result = runCommand(spec);
    process.stderr.write(`[evidence] exit code: ${result.exitCode}\n`);
    return result;
  });
  const worstExitCode = results.reduce(
    (worst, result) => Math.max(worst, result.exitCode === 0 ? 0 : 1),
    0,
  );
  return { document: renderEvidence(collectMetadata(), results), worstExitCode };
}

function main(): number {
  const checkMode = process.argv.includes('--check');
  const { document, worstExitCode } = generate();
  if (!checkMode) {
    writeFileSync(EVIDENCE_PATH, document, 'utf8');
    process.stdout.write(document);
    return worstExitCode;
  }
  let committed: string;
  try {
    committed = readFileSync(EVIDENCE_PATH, 'utf8');
  } catch {
    process.stderr.write('[evidence] EVIDENCE.md not found; run npm run evidence first.\n');
    return 1;
  }
  const difference = firstDifference(
    normalizeEvidence(committed),
    normalizeEvidence(document),
  );
  if (difference !== null) {
    process.stderr.write(
      `[evidence] EVIDENCE.md does not match regenerated output.\n${difference}\n`,
    );
    return 1;
  }
  process.stderr.write('[evidence] EVIDENCE.md matches regenerated output.\n');
  return worstExitCode;
}

process.exitCode = main();
