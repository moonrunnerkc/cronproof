/**
 * Prints the dialect acceptance/rejection table from the same shared
 * cases the test asserts against, using the real validator output.
 * Run for evidence: it shows each expression, the dialect, whether it
 * was accepted or rejected, and the located reason for rejections.
 */

import { validate } from '../src/cron/index';
import { REJECTION_CASES } from '../src/cron/rejection-table';

function main(): number {
  process.stdout.write('cronproof dialect acceptance and rejection table\n\n');
  const header = ['dialect', 'expression', 'verdict', 'offset', 'reason'];
  const rows: string[][] = [header];
  let mismatches = 0;

  for (const testCase of REJECTION_CASES) {
    const errors = validate(testCase.expression, testCase.dialect);
    const rejected = errors.length > 0;
    const first = errors[0];
    rows.push([
      testCase.dialect,
      testCase.expression,
      rejected ? 'REJECT' : 'ACCEPT',
      rejected && first !== undefined ? String(first.offset) : '',
      rejected && first !== undefined ? first.reason : '',
    ]);
    if (rejected === testCase.accepted) {
      mismatches += 1;
    }
    if (
      rejected &&
      testCase.reasonIncludes !== undefined &&
      (first === undefined || !first.reason.includes(testCase.reasonIncludes))
    ) {
      mismatches += 1;
    }
  }

  const widths = header.map((_, col) => Math.max(...rows.map((row) => (row[col] ?? '').length)));
  for (const row of rows) {
    const line = row
      .map((cell, col) => (col === row.length - 1 ? cell : cell.padEnd(widths[col] ?? 0)))
      .join('  ');
    process.stdout.write(`${line.trimEnd()}\n`);
  }

  process.stdout.write(`\ncases: ${REJECTION_CASES.length}\n`);
  process.stdout.write(`mismatches against expected: ${mismatches}\n`);
  process.stdout.write(`result: ${mismatches === 0 ? 'PASS' : 'FAIL'}\n`);
  return mismatches === 0 ? 0 : 1;
}

process.exitCode = main();
