import { describe, expect, test } from 'vitest';
import { parse, type DialectId } from '../../src/cron/index';
import { buildVerdict } from '../../src/analyze/index';
import { createIntlBackend, vendoredZoneinfoRoot } from '../../src/tz/index';
import { runCheck } from '../../src/cli/commands/check';
import type { ParsedArgs } from '../../src/cli/args';
import { parseDateString } from '../../web/src/state';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;
const intl = createIntlBackend();

interface Case {
  expr: string;
  dialect: DialectId;
  zone: string;
  from: string;
  to: string;
  idem: boolean;
}

function c(expr: string, dialect: DialectId, zone: string, from: string, to: string, idem = false): Case {
  return { expr, dialect, zone, from, to, idem };
}

// Fifty cases spanning the hazard classes the browser can detect
// (skipped, doubled, interval drift, count anomaly, and clean windows),
// across zones with hour, half-hour, 45-minute, two-hour, negative, and
// date-line transitions, under three cron dialects. Windows stay inside
// the recorded transition table (<= 2025) so neither side emits
// ZONE_UNSTABLE, which single-backend mode cannot compute.
const CASES: Case[] = [
  c('30 2 * * *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('30 1 * * *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('*/15 * * * *', 'vixie', 'America/New_York', '2024-03-09', '2024-03-11'),
  c('0 0 * * *', 'vixie', 'Pacific/Apia', '2011-01-01', '2012-01-01'),
  c('15 2 * * *', 'vixie', 'Australia/Lord_Howe', '2024-01-01', '2025-01-01'),
  c('45 2 * * *', 'vixie', 'Australia/Lord_Howe', '2024-01-01', '2025-01-01'),
  c('0 2 * * *', 'vixie', 'Antarctica/Troll', '2024-01-01', '2025-01-01'),
  c('30 1 * * *', 'vixie', 'Europe/Dublin', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Europe/London', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Europe/Berlin', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'debian', 'Europe/Berlin', '2025-01-01', '2026-01-01'),
  c('30 2 * * *', 'k8s', 'Europe/Berlin', '2024-01-01', '2025-01-01'),
  c('0 2 * * *', 'vixie', 'Europe/Lisbon', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Europe/Paris', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Europe/Madrid', '2023-01-01', '2024-01-01'),
  c('30 2 * * *', 'debian', 'America/Chicago', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'America/Denver', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'k8s', 'America/Los_Angeles', '2024-01-01', '2025-01-01'),
  c('30 1 * * *', 'vixie', 'America/Los_Angeles', '2024-01-01', '2025-01-01'),
  c('45 2 * * *', 'vixie', 'Pacific/Chatham', '2024-01-01', '2025-01-01'),
  c('15 2 * * *', 'vixie', 'Pacific/Chatham', '2024-01-01', '2025-01-01'),
  c('0 0 * * *', 'vixie', 'Pacific/Kiritimati', '1994-01-01', '1995-06-01'),
  c('30 2 * * *', 'vixie', 'Asia/Tehran', '2020-01-01', '2021-01-01'),
  c('30 2 * * *', 'vixie', 'America/Sao_Paulo', '2018-01-01', '2019-01-01'),
  c('30 2 * * *', 'vixie', 'America/Sao_Paulo', '2024-01-01', '2025-01-01'),
  c('0 3 * * *', 'vixie', 'Africa/Casablanca', '2024-01-01', '2025-01-01'),
  c('30 0 * * *', 'vixie', 'Asia/Gaza', '2024-01-01', '2025-01-01'),
  c('0 0 * * *', 'debian', 'America/Santiago', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'America/Santiago', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Asia/Kolkata', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Asia/Tokyo', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'UTC', '2024-01-01', '2025-01-01'),
  c('*/30 * * * *', 'vixie', 'Australia/Lord_Howe', '2024-04-06', '2024-04-08'),
  c('*/10 * * * *', 'vixie', 'Europe/Berlin', '2024-10-26', '2024-10-28'),
  c('*/20 2 * * *', 'vixie', 'America/New_York', '2024-03-09', '2024-03-11'),
  c('0 2 * * 0', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('0 2 1 * *', 'vixie', 'Europe/Berlin', '2024-01-01', '2025-01-01'),
  c('30 2 * 3 *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('30 1 * 11 *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01', true),
  c('30 1 * * *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01', true),
  c('0 0 * * *', 'vixie', 'Australia/Sydney', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'Australia/Sydney', '2024-01-01', '2025-01-01'),
  c('0 0 * * *', 'vixie', 'Pacific/Auckland', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'k8s', 'Pacific/Auckland', '2024-01-01', '2025-01-01'),
  c('30 3 * * *', 'debian', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('0 12 * * *', 'vixie', 'America/New_York', '2024-01-01', '2025-01-01'),
  c('30 2 * * *', 'vixie', 'America/St_Johns', '2024-01-01', '2025-01-01'),
  c('30 0 * * *', 'vixie', 'America/St_Johns', '2024-01-01', '2025-01-01'),
  c('*/5 * * * *', 'vixie', 'Pacific/Chatham', '2024-09-28', '2024-09-30'),
];

function cliData(testCase: Case): Record<string, unknown> {
  const from = parseDateString(testCase.from);
  const to = parseDateString(testCase.to);
  if (from === null || to === null) {
    throw new Error(`bad date in case: ${JSON.stringify(testCase)}`);
  }
  const args: ParsedArgs = {
    command: 'check',
    format: 'json',
    positional: testCase.expr,
    zone: testCase.zone,
    from: { text: testCase.from, fields: from },
    to: { text: testCase.to, fields: to },
    at: null,
    dialect: testCase.dialect,
    failOn: 'high',
    idempotent: testCase.idem,
    zoneinfoRoot: ROOT,
    hazardWindow: null,
    baseline: null,
    out: null,
    tzdbCheck: null,
  };
  const result = runCheck(args);
  if ('usageError' in result) {
    throw new Error(`CLI rejected case ${JSON.stringify(testCase)}: ${result.usageError}`);
  }
  return result.model.data;
}

describe('the browser (Intl) verdict is identical to the CLI (TZif) verdict', () => {
  test('all 50 fixed cases match the CLI on hazards, severity tally, and the scheduler differential', () => {
    let totalHazards = 0;
    let unstable = 0;
    for (const testCase of CASES) {
      const parsed = parse(testCase.expr, testCase.dialect);
      expect(parsed.ok, `web could not parse ${JSON.stringify(testCase)}`).toBe(true);
      if (!parsed.ok) {
        continue;
      }
      const from = parseDateString(testCase.from);
      const to = parseDateString(testCase.to);
      if (from === null || to === null) {
        throw new Error('unreachable: dates validated by case data');
      }

      const web = buildVerdict(parsed.ast, intl, {
        expression: testCase.expr,
        dialect: testCase.dialect,
        zone: testCase.zone,
        from,
        to,
        idempotent: testCase.idem,
      });
      const cli = cliData(testCase);
      const label = `${testCase.expr} [${testCase.dialect}] ${testCase.zone} ${testCase.from}..${testCase.to}`;

      expect(web.hazards, `hazards differ for ${label}`).toEqual(cli.hazards);
      expect(web.hazardCount, `hazard count differs for ${label}`).toEqual(cli.hazardCount);
      expect(web.bySeverity, `severity tally differs for ${label}`).toEqual(cli.bySeverity);
      expect(web.differential, `differential differs for ${label}`).toEqual(cli.differential);

      unstable += web.hazards.filter((h) => h.kind === 'ZONE_UNSTABLE').length;
      totalHazards += web.hazardCount;
    }
    // Guard: the matrix must stay in the regime the browser can compute.
    expect(unstable, 'a case reached the ZONE_UNSTABLE regime the browser cannot detect').toBe(0);
    expect(CASES).toHaveLength(50);
    process.stdout.write(`\n[parity] cases=${CASES.length} totalHazards=${totalHazards} zoneUnstable=${unstable}\n`);
  });
});
