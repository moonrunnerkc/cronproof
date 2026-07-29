/**
 * Builds a zoneinfo tree for a named IANA tzdb release, so a tzdb
 * mismatch has a mechanical remedy instead of a scavenger hunt.
 *
 * The agreement gate compares the runtime's ICU tzdb against the
 * zoneinfo root's +VERSION and refuses to answer when they differ.
 * That gate is right: a verdict computed against a stale rule set is
 * worth nothing. But Node ships ICU updates in patch releases, so the
 * pinned vendored tree stops matching on most Nodes, and the only way
 * back to green used to be finding the one Node build whose ICU
 * happened to agree. This script is the other way back: name the
 * release your runtime has, get a tree that says so.
 *
 * Usage:
 *   pnpm tzdb:sync 2025b [--out <dir>] [--force]
 *
 * It clones eggert/tz at the release tag, builds that release's own
 * zic, compiles the data files with it, writes +VERSION, and prints
 * the --zoneinfo-root to pass. Nothing is downloaded unverified into
 * the tree: the tag is the provenance, and +VERSION records it.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TZ_REPO = 'https://github.com/eggert/tz.git';

/**
 * The data files zic compiles into the standard zone set. `backward`
 * carries the historical links (US/Eastern and friends) that real
 * crontabs still name, so leaving it out would make a zone the
 * scanner reads from a file unresolvable here.
 */
const DATA_FILES = [
  'africa',
  'antarctica',
  'asia',
  'australasia',
  'europe',
  'northamerica',
  'southamerica',
  'etcetera',
  'backward',
  'factory',
];

function fail(message: string): never {
  process.stderr.write(`tzdb:sync: ${message}\n`);
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requireTool(tool: string, install: string): void {
  try {
    execFileSync('command', ['-v', tool], { shell: '/bin/sh', stdio: 'ignore' });
  } catch {
    fail(`${tool} is not on PATH and is needed to build a tzdb release; install it with ${install}`);
  }
}

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/**
 * Parses the release argument: the first positional that is not a flag
 * or a flag's value.
 */
function releaseArg(): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i] ?? '';
    if (item === '--force') {
      continue;
    }
    if (item === '--out') {
      i += 1;
      continue;
    }
    if (!item.startsWith('-')) {
      return item;
    }
  }
  fail(
    'no release given; run "pnpm tzdb:sync <release>", for example ' +
      '"pnpm tzdb:sync 2025b". Read the release your runtime needs from ' +
      'node -p "process.versions.tz"',
  );
}

function main(): void {
  const release = releaseArg();
  if (!/^\d{4}[a-z]{1,2}$/.test(release)) {
    fail(`"${release}" is not an IANA release name; they look like 2025b or 2024ag`);
  }
  requireTool('git', 'your package manager (apt install git)');
  requireTool('make', 'your package manager (apt install make)');
  requireTool('cc', 'your package manager (apt install build-essential)');

  const out = path.resolve(REPO_ROOT, argValue('--out') ?? path.join('vendor', `zoneinfo-${release}`));
  const force = process.argv.includes('--force');
  if (existsSync(out) && readdirSync(out).length > 0 && !force) {
    fail(`${out} already exists and is not empty; pass --force to rebuild it, or --out <dir>`);
  }

  const work = mkdtempSync(path.join(tmpdir(), 'cronproof-tzdb-'));
  try {
    process.stdout.write(`[tzdb:sync] cloning ${TZ_REPO} at ${release}\n`);
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', release, TZ_REPO, work], REPO_ROOT);
    process.stdout.write('[tzdb:sync] building zic from that release\n');
    run('make', ['--quiet', 'zic'], work);
    mkdirSync(out, { recursive: true });
    process.stdout.write(`[tzdb:sync] compiling ${DATA_FILES.length} data files into ${out}\n`);
    run('./zic', ['-b', 'fat', '-d', out, ...DATA_FILES], work);
    writeFileSync(path.join(out, '+VERSION'), `${release}\n`, 'utf8');
  } catch (error) {
    throw new Error(
      `building tzdb ${release} failed; check that ${release} is a real IANA release tag ` +
        `(git ls-remote --tags ${TZ_REPO} lists them)`,
      { cause: error },
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const relative = path.relative(process.cwd(), out) || '.';
  process.stdout.write(
    `\n[tzdb:sync] wrote tzdb ${release} to ${out}\n` +
      `  use it:     --zoneinfo-root ${relative}\n` +
      `  adopt it:   rm -rf vendor/zoneinfo && mv ${relative} vendor/zoneinfo\n` +
      `  your ICU:   ${process.versions.tz ?? 'unknown'} (the gate wants these to match)\n`,
  );
}

main();
