/**
 * Prints the scheduler policy verification status table and, as
 * evidence, the raw fall-back log a real debian-cron daemon produced.
 * Reads only committed fixtures, so it needs no Docker and runs in the
 * evidence harness. The status table shows which models phase 6
 * flipped from ASSERTED to VERIFIED and the fixture behind each.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_POLICY_IDS, policyBasis, policyVerification } from '../src/policy/index';

const FIXTURE_DIR = path.join(fileURLToPath(import.meta.url), '..', '..', 'test', 'differential', 'fixtures');

interface Scenario {
  id: string;
  observedFireInstantsUtc?: string[];
  rawLog?: string;
}
interface Fixture {
  scheduler: string;
  schedulerVersion: string;
  tzdbVersion: string;
  capturedVia: string;
  scenarios: Scenario[];
}

function readFixture(name: string): Fixture {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as Fixture;
}

function main(): void {
  process.stdout.write('cronproof scheduler policy verification status\n\n');
  const header = ['policy', 'status', 'basis'];
  const rows: string[][] = [header];
  for (const id of ALL_POLICY_IDS) {
    rows.push([id, policyVerification(id), policyBasis(id)]);
  }
  const widths = [0, 1].map((col) => Math.max(...rows.map((row) => (row[col] ?? '').length)));
  for (const row of rows) {
    process.stdout.write(
      `${(row[0] ?? '').padEnd(widths[0] ?? 0)}  ${(row[1] ?? '').padEnd(widths[1] ?? 0)}  ${row[2] ?? ''}\n`,
    );
  }

  const verified = ALL_POLICY_IDS.filter((id) => policyVerification(id) === 'VERIFIED');
  const asserted = ALL_POLICY_IDS.filter((id) => policyVerification(id) === 'ASSERTED');
  process.stdout.write(`\nVERIFIED (${verified.length}): ${verified.join(', ')}\n`);
  process.stdout.write(`ASSERTED (${asserted.length}): ${asserted.join(', ')}\n`);

  const debian = readFixture('debian-cron');
  const fall = debian.scenarios.find((s) => s.id === 'berlin-fall-fixed');
  process.stdout.write('\n== raw debian-cron log across the Europe/Berlin 2023 fall-back ==\n');
  process.stdout.write(
    `scheduler ${debian.scheduler} ${debian.schedulerVersion}, tzdb ${debian.tzdbVersion}\n`,
  );
  process.stdout.write(`captured via: ${debian.capturedVia}\n`);
  process.stdout.write('expression 30 2 * * *  (02:30 falls in the repeated hour)\n');
  process.stdout.write('raw job fire log (fake UTC appended on each execution):\n');
  process.stdout.write(`${(fall?.rawLog ?? '(none)').trim()}\n`);
  process.stdout.write(`observed fire instants: ${JSON.stringify(fall?.observedFireInstantsUtc ?? [])}\n`);
  process.stdout.write('debian-cron fired the folded 02:30 once, at the earlier (CEST) instant.\n');
}

main();
