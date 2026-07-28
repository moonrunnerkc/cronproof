/**
 * Prints the differential disagreement matrix for the three
 * acceptance cases and a table of every policy with its current
 * verification status. Uses the vendored zoneinfo so output matches
 * the Intl tzdb release and is reproducible. Each case is checked
 * against its expected verdict so the script fails loudly on drift.
 */

import { parse } from '../src/cron/index';
import type { LocalFiring } from '../src/cron/index';
import { formatLocal } from '../src/hazard/index';
import {
  ALL_POLICY_IDS,
  policyBasis,
  policyVerification,
  runDifferential,
} from '../src/policy/index';
import type { DifferentialReport } from '../src/policy/index';
import { createTzifBackend, vendoredZoneinfoRoot, type TzifBackend } from '../src/tz/index';

interface Case {
  expression: string;
  zone: string;
  from: LocalFiring;
  to: LocalFiring;
  note: string;
  expectVerdict: DifferentialReport['verdict'];
}

const at = (year: number, month: number, day: number): LocalFiring => ({
  year,
  month,
  day,
  hour: 0,
  minute: 0,
  second: 0,
});

const CASES: Case[] = [
  {
    expression: '30 2 * * *',
    zone: 'Europe/Berlin',
    from: at(2023, 10, 29),
    to: at(2023, 10, 30),
    note: 'fall-back: debian once, k8s twice, naive twice',
    expectVerdict: 'disagreement',
  },
  {
    expression: '*/10 * * * *',
    zone: 'Europe/Berlin',
    from: at(2023, 3, 26),
    to: at(2023, 3, 27),
    note: 'spring-forward: debian and naive agree (wildcard path)',
    expectVerdict: 'disagreement',
  },
  {
    expression: '0 4 * * *',
    zone: 'Europe/Berlin',
    from: at(2023, 1, 1),
    to: at(2024, 1, 1),
    note: 'the safe case: total agreement',
    expectVerdict: 'total-agreement',
  },
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function cellText(kind: string, instants: number[]): string {
  if (kind === 'UNDEFINED') {
    return 'UNDEFINED';
  }
  if (instants.length === 0) {
    return 'DOES_NOT_FIRE';
  }
  return `${kind}(${instants.map(iso).join(', ')})`;
}

function columnSummary(kinds: string[]): string {
  const unique = [...new Set(kinds)];
  if (unique.length === 1 && kinds.length > 1) {
    return `${unique[0]} x${kinds.length}`;
  }
  return kinds.join(', ');
}

function printReport(report: DifferentialReport): void {
  process.stdout.write(`\n== ${report.expression}  ${report.zone}\n`);
  if (report.decisionPoints.length === 0) {
    process.stdout.write('  no decision points (every firing is unique)\n');
  } else {
    const points = report.decisionPoints
      .map((point) => `${formatLocal(point.intendedLocal)} (${point.resolutionKind})`)
      .join(', ');
    process.stdout.write(`  ${report.decisionPoints.length} decision point(s): ${points}\n`);
    for (const column of report.columns) {
      const kinds = column.cells.map((cell) => cellText(cell.outcomeKind, cell.instants));
      process.stdout.write(
        `    ${column.policyId.padEnd(18)} ${column.verification.padEnd(9)} fires=${column.hazardFiringCount}  ${columnSummary(kinds)}\n`,
      );
    }
  }
  const differ = report.pairs.filter((pair) => pair.relation === 'differ');
  const undetermined = report.pairs.filter((pair) => pair.relation === 'undetermined').length;
  process.stdout.write(`  verdict: ${report.verdict} (safe to port: ${report.safeToPort})\n`);
  if (differ.length === 0) {
    process.stdout.write('  definite disagreements: none\n');
  }
  for (const pair of differ) {
    process.stdout.write(`  definite disagreement: ${pair.a} vs ${pair.b}\n`);
  }
  process.stdout.write(`  undetermined pairs (an unverified model on one side): ${undetermined}\n`);
}

function main(): number {
  const root = vendoredZoneinfoRoot();
  if (root === null) {
    process.stdout.write('vendored zoneinfo not found; run the phase 2 vendoring step\n');
    return 1;
  }
  const backend: TzifBackend = createTzifBackend({ zoneinfoRoot: root });
  process.stdout.write('cronproof differential disagreement matrix (vendored zoneinfo)\n');

  let failures = 0;
  for (const testCase of CASES) {
    const parsed = parse(testCase.expression, 'vixie');
    if (!parsed.ok) {
      process.stdout.write(`PARSE ERROR ${testCase.expression}\n`);
      failures += 1;
      continue;
    }
    const report = runDifferential({
      ast: parsed.ast,
      expression: testCase.expression,
      dialect: 'vixie',
      zone: testCase.zone,
      from: testCase.from,
      to: testCase.to,
      backend,
    });
    printReport(report);
    process.stdout.write(`  (${testCase.note})\n`);
    const ok = report.verdict === testCase.expectVerdict;
    if (!ok) {
      failures += 1;
      process.stdout.write(`  MISMATCH: expected ${testCase.expectVerdict}\n`);
    }
  }

  process.stdout.write('\n== policy verification table\n');
  for (const id of ALL_POLICY_IDS) {
    process.stdout.write(`  ${id.padEnd(18)} ${policyVerification(id).padEnd(9)} ${policyBasis(id)}\n`);
  }

  process.stdout.write(`\ncases: ${CASES.length}\n`);
  process.stdout.write(`mismatches: ${failures}\n`);
  process.stdout.write(`result: ${failures === 0 ? 'PASS' : 'FAIL'}\n`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = main();
