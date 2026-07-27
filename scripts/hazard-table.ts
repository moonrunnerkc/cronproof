/**
 * Prints the full hazard table for each acceptance case, using the
 * vendored zoneinfo so the output matches the Intl tzdb release and
 * is reproducible. Each row is a real hazard from the classifier; the
 * per-case expectation is checked so the script fails loudly if the
 * classification drifts.
 *
 * Note on the November case: the brief pairs the DOUBLED with
 * `30 2 * * *`, but 02:30 is not in New York's folded hour (which is
 * 01:00 to 01:59), so `30 2` is unique in November. The expression
 * that doubles is `30 1 * * *`. Both are shown. See DECISIONS.md.
 */

import { parse } from '../src/cron/index';
import type { DialectId, LocalFiring } from '../src/cron/index';
import { classifyHazards, formatLocal } from '../src/hazard/index';
import type { Hazard } from '../src/hazard/index';
import { createTzifBackend, vendoredZoneinfoRoot } from '../src/tz/index';

interface Case {
  expression: string;
  dialect: DialectId;
  zone: string;
  fromYear: number;
  toYear: number;
  expect: Partial<Record<Hazard['kind'], number>>;
  note: string;
}

const CASES: Case[] = [
  { expression: '30 2 * * *', dialect: 'vixie', zone: 'America/New_York', fromYear: 2024, toYear: 2025, expect: { SKIPPED: 1 }, note: 'spring-forward skip at 02:30' },
  { expression: '30 1 * * *', dialect: 'vixie', zone: 'America/New_York', fromYear: 2024, toYear: 2025, expect: { DOUBLED: 1 }, note: 'fall-back double at 01:30 (the hour that actually folds)' },
  { expression: '*/15 * * * *', dialect: 'vixie', zone: 'America/New_York', fromYear: 2024, toYear: 2025, expect: { INTERVAL_DRIFT: 2 }, note: 'interval drift, no skip or double' },
  { expression: '0 0 * * *', dialect: 'vixie', zone: 'Pacific/Apia', fromYear: 2011, toYear: 2012, expect: { SKIPPED: 1, COUNT_ANOMALY: 1 }, note: 'December 30 2011 does not exist' },
  { expression: '15 2 * * *', dialect: 'vixie', zone: 'Australia/Lord_Howe', fromYear: 2024, toYear: 2025, expect: { SKIPPED: 1 }, note: '30-minute shift skips 02:15' },
  { expression: '45 2 * * *', dialect: 'vixie', zone: 'Australia/Lord_Howe', fromYear: 2024, toYear: 2025, expect: {}, note: '02:45 exists after the 30-minute shift' },
  { expression: '*/15 * * * *', dialect: 'vixie', zone: 'UTC', fromYear: 2024, toYear: 2026, expect: {}, note: 'null test: UTC has no transitions' },
];

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function detailSummary(hazard: Hazard): string {
  const d = hazard.detail;
  switch (d.kind) {
    case 'SKIPPED':
      return `gap ${d.skipped.gapDurationMillis / 60_000}min`;
    case 'DOUBLED':
      return `fold ${d.doubled.foldDurationMillis / 60_000}min instants ${hazard.instants.map(iso).join(',')}`;
    case 'INTERVAL_DRIFT':
      return `expected ${d.drift.expectedIntervalMillis / 60_000}min actual ${d.drift.actualIntervalMillis / 60_000}min pair ${formatLocal(d.drift.before)}..${formatLocal(d.drift.after)}`;
    case 'COUNT_ANOMALY':
      return `${d.count.reason} count ${d.count.dayFiringCount} vs modal ${d.count.modalCount}`;
    case 'ZONE_UNSTABLE':
      return `${d.unstable.reason} lastTable ${d.unstable.lastTableTransitionInstant === null ? 'none' : iso(d.unstable.lastTableTransitionInstant)}`;
  }
}

function counts(hazards: Hazard[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hazard of hazards) {
    out[hazard.kind] = (out[hazard.kind] ?? 0) + 1;
  }
  return out;
}

function matches(actual: Record<string, number>, expected: Case['expect']): boolean {
  const kinds = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const kind of kinds) {
    if ((actual[kind] ?? 0) !== (expected[kind as Hazard['kind']] ?? 0)) {
      return false;
    }
  }
  return true;
}

function main(): number {
  const root = vendoredZoneinfoRoot();
  if (root === null) {
    process.stdout.write('vendored zoneinfo not found; run the phase 2 vendoring step\n');
    return 1;
  }
  const backend = createTzifBackend({ zoneinfoRoot: root });
  process.stdout.write('cronproof hazard table (vendored zoneinfo)\n');
  let failures = 0;

  const midnight = (year: number): LocalFiring => ({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 });

  for (const testCase of CASES) {
    const parsed = parse(testCase.expression, testCase.dialect);
    process.stdout.write(
      `\n== ${testCase.expression}  [${testCase.dialect}]  ${testCase.zone}  ${testCase.fromYear}  (${testCase.note})\n`,
    );
    if (!parsed.ok) {
      process.stdout.write(`  PARSE ERROR: ${JSON.stringify(parsed.errors)}\n`);
      failures += 1;
      continue;
    }
    const hazards = classifyHazards(parsed.ast, backend, {
      expression: testCase.expression,
      dialect: testCase.dialect,
      zone: testCase.zone,
      from: midnight(testCase.fromYear),
      to: midnight(testCase.toYear),
      zoneinfoRoot: root,
    });
    if (hazards.length === 0) {
      process.stdout.write('  (no hazards)\n');
    }
    for (const hazard of hazards) {
      process.stdout.write(
        `  ${hazard.kind.padEnd(15)} ${hazard.severity.padEnd(9)} ${formatLocal(hazard.intendedLocal)}  ${hazard.id}  ${detailSummary(hazard)}\n`,
      );
    }
    const actual = counts(hazards);
    const ok = matches(actual, testCase.expect);
    if (!ok) {
      failures += 1;
    }
    process.stdout.write(
      `  counts ${JSON.stringify(actual)} expected ${JSON.stringify(testCase.expect)} -> ${ok ? 'OK' : 'MISMATCH'}\n`,
    );
  }

  process.stdout.write(`\ncases: ${CASES.length}\n`);
  process.stdout.write(`mismatches: ${failures}\n`);
  process.stdout.write(`result: ${failures === 0 ? 'PASS' : 'FAIL'}\n`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = main();
