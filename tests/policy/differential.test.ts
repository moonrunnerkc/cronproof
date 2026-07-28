import { beforeAll, describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import type { LocalFiring } from '../../src/cron/index';
import { pairRelation, runDifferential } from '../../src/policy/index';
import type { DifferentialReport, PolicyId } from '../../src/policy/index';
import { createTzifBackend, vendoredZoneinfoRoot, type TzifBackend } from '../../src/tz/index';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}

let backend: TzifBackend;
beforeAll(() => {
  backend = createTzifBackend({ zoneinfoRoot: root });
});

const at = (year: number, month: number, day: number): LocalFiring => ({
  year,
  month,
  day,
  hour: 0,
  minute: 0,
  second: 0,
});

function report(expression: string, zone: string, from: LocalFiring, to: LocalFiring): DifferentialReport {
  const parsed = parse(expression, 'vixie');
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  return runDifferential({ ast: parsed.ast, expression, dialect: 'vixie', zone, from, to, backend });
}

function columnFor(report: DifferentialReport, id: PolicyId): { kinds: string[]; count: number } {
  const column = report.columns.find((candidate) => candidate.policyId === id);
  if (column === undefined) {
    throw new Error(`no column for ${id}`);
  }
  return { kinds: column.cells.map((cell) => cell.outcomeKind), count: column.hazardFiringCount };
}

describe('30 2 * * * Europe/Berlin at the 2023 fall-back', () => {
  test('debian-cron fires once, k8s-cronjob fires twice, naive fires twice, and the disagreement is reported', () => {
    const differential = report('30 2 * * *', 'Europe/Berlin', at(2023, 10, 29), at(2023, 10, 30));
    expect(differential.decisionPoints).toHaveLength(1);
    expect(differential.decisionPoints[0]?.resolutionKind).toBe('ambiguous');

    expect(columnFor(differential, 'debian-cron')).toEqual({ kinds: ['FIRES_ONCE_AT'], count: 1 });
    expect(columnFor(differential, 'k8s-cronjob')).toEqual({ kinds: ['FIRES_TWICE_AT'], count: 2 });
    expect(columnFor(differential, 'naive')).toEqual({ kinds: ['FIRES_TWICE_AT'], count: 2 });

    expect(pairRelation(differential, 'debian-cron', 'k8s-cronjob')).toBe('differ');
    expect(pairRelation(differential, 'debian-cron', 'naive')).toBe('differ');
    expect(pairRelation(differential, 'k8s-cronjob', 'naive')).toBe('agree');
    expect(differential.verdict).toBe('disagreement');
    expect(differential.safeToPort).toBe(false);
  });
});

describe('*/10 * * * * at spring forward', () => {
  test('debian-cron and naive agree, because the wildcard path disables special handling', () => {
    const differential = report('*/10 * * * *', 'Europe/Berlin', at(2023, 3, 26), at(2023, 3, 27));
    expect(differential.decisionPoints.length).toBeGreaterThan(0);
    for (const point of differential.decisionPoints) {
      expect(point.resolutionKind).toBe('nonexistent');
    }
    expect(pairRelation(differential, 'debian-cron', 'naive')).toBe('agree');
    expect(columnFor(differential, 'debian-cron')).toEqual(columnFor(differential, 'naive'));
  });
});

describe('a 04:00 schedule is the safe case', () => {
  test.each(['Europe/Berlin', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Apia'])(
    'total agreement across all policies in %s',
    (zone) => {
      const differential = report('0 4 * * *', zone, at(2023, 1, 1), at(2024, 1, 1));
      expect(differential.decisionPoints).toHaveLength(0);
      expect(differential.verdict).toBe('total-agreement');
      expect(differential.safeToPort).toBe(true);
      expect(differential.pairs.every((pair) => pair.relation === 'agree')).toBe(true);
    },
  );
});
