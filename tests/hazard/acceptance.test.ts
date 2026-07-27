import { beforeAll, describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import type { DialectId, LocalFiring } from '../../src/cron/index';
import { classifyHazards } from '../../src/hazard/index';
import type { Hazard } from '../../src/hazard/index';
import { createTzifBackend, vendoredZoneinfoRoot, type TzifBackend } from '../../src/tz/index';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;

let backend: TzifBackend;
beforeAll(() => {
  backend = createTzifBackend({ zoneinfoRoot: ROOT });
});

const midnight = (year: number, month: number, day = 1): LocalFiring => ({
  year,
  month,
  day,
  hour: 0,
  minute: 0,
  second: 0,
});

function classify(
  expression: string,
  dialect: DialectId,
  zone: string,
  fromYear: number,
  toYear: number,
  idempotent = false,
): Hazard[] {
  const parsed = parse(expression, dialect);
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  return classifyHazards(parsed.ast, backend, {
    expression,
    dialect,
    zone,
    from: midnight(fromYear, 1),
    to: midnight(toYear, 1),
    zoneinfoRoot: ROOT,
    idempotent,
  });
}

function ofKind(hazards: Hazard[], kind: Hazard['kind']): Hazard[] {
  return hazards.filter((hazard) => hazard.kind === kind);
}

describe('30 2 * * * America/New_York over 2024', () => {
  test('exactly one SKIPPED on March 10, at 02:30, caused by the spring-forward transition', () => {
    const hazards = classify('30 2 * * *', 'vixie', 'America/New_York', 2024, 2025);
    const skipped = ofKind(hazards, 'SKIPPED');
    expect(skipped).toHaveLength(1);
    const hazard = skipped[0];
    expect(hazard?.intendedLocal).toEqual({ year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 });
    expect(hazard?.instants).toEqual([]);
    expect(hazard?.causingTransition?.instant).toBe(Date.UTC(2024, 2, 10, 7, 0));
    expect(hazard?.detail.kind === 'SKIPPED' && hazard.detail.skipped.gapDurationMillis).toBe(3_600_000);
    expect(ofKind(hazards, 'DOUBLED')).toHaveLength(0);
  });
});

describe('the November fall-back doubles 01:30, not 02:30 (documented correction)', () => {
  test('30 2 * * * is unique on November 3 (02:30 is not in the folded hour)', () => {
    const hazards = classify('30 2 * * *', 'vixie', 'America/New_York', 2024, 2025);
    const novemberDoubles = ofKind(hazards, 'DOUBLED').filter((h) => h.intendedLocal.month === 11);
    expect(novemberDoubles).toHaveLength(0);
  });

  test('30 1 * * * has exactly one DOUBLED on November 3 at 01:30 with both instants', () => {
    const hazards = classify('30 1 * * *', 'vixie', 'America/New_York', 2024, 2025);
    const doubled = ofKind(hazards, 'DOUBLED');
    expect(doubled).toHaveLength(1);
    const hazard = doubled[0];
    expect(hazard?.intendedLocal).toEqual({ year: 2024, month: 11, day: 3, hour: 1, minute: 30, second: 0 });
    expect(hazard?.instants).toEqual([Date.UTC(2024, 10, 3, 5, 30), Date.UTC(2024, 10, 3, 6, 30)]);
    expect(hazard?.detail.kind === 'DOUBLED' && hazard.detail.doubled.foldDurationMillis).toBe(3_600_000);
  });
});

describe('*/15 * * * * America/New_York over 2024', () => {
  test('zero SKIPPED, zero DOUBLED, exactly two INTERVAL_DRIFT', () => {
    const hazards = classify('*/15 * * * *', 'vixie', 'America/New_York', 2024, 2025);
    expect(ofKind(hazards, 'SKIPPED')).toHaveLength(0);
    expect(ofKind(hazards, 'DOUBLED')).toHaveLength(0);
    const drift = ofKind(hazards, 'INTERVAL_DRIFT');
    expect(drift).toHaveLength(2);
    for (const hazard of drift) {
      expect(hazard.detail.kind).toBe('INTERVAL_DRIFT');
      if (hazard.detail.kind === 'INTERVAL_DRIFT') {
        expect(hazard.detail.drift.expectedIntervalMillis).toBe(15 * 60_000);
        expect(hazard.detail.drift.actualIntervalMillis).toBe(75 * 60_000);
      }
    }
  });
});

describe('0 0 * * * Pacific/Apia over 2011', () => {
  test('COUNT_ANOMALY for December 30, the calendar day that does not exist', () => {
    const hazards = classify('0 0 * * *', 'vixie', 'Pacific/Apia', 2011, 2012);
    const countAnomalies = ofKind(hazards, 'COUNT_ANOMALY');
    expect(countAnomalies).toHaveLength(1);
    const hazard = countAnomalies[0];
    expect(hazard?.intendedLocal).toEqual({ year: 2011, month: 12, day: 30, hour: 0, minute: 0, second: 0 });
    expect(hazard?.detail.kind === 'COUNT_ANOMALY' && hazard.detail.count.reason).toBe('phantom-day');
    expect(hazard?.detail.kind === 'COUNT_ANOMALY' && hazard.detail.count.dayFiringCount).toBe(0);
    expect(hazard?.detail.kind === 'COUNT_ANOMALY' && hazard.detail.count.modalCount).toBe(1);
  });
});

describe('Australia/Lord_Howe October 30-minute transition', () => {
  test('15 2 * * * is SKIPPED at the October 2024 transition', () => {
    const hazards = classify('15 2 * * *', 'vixie', 'Australia/Lord_Howe', 2024, 2025);
    const skipped = ofKind(hazards, 'SKIPPED');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.intendedLocal).toEqual({ year: 2024, month: 10, day: 6, hour: 2, minute: 15, second: 0 });
  });

  test('45 2 * * * produces no hazards, because 02:45 exists after the 30-minute shift', () => {
    const hazards = classify('45 2 * * *', 'vixie', 'Australia/Lord_Howe', 2024, 2025);
    expect(hazards).toEqual([]);
  });
});
