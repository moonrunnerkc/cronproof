import { describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import { classifyHazards, hazardId } from '../../src/hazard/index';
import type { Hazard, HazardIdentity } from '../../src/hazard/index';
import { backend, midnight, ROOT } from './support';

// Phase 4 built the hazard classifier. Criteria reconstructed from the
// phase-4 DECISIONS entries: the five hazard kinds are classified, and the
// hazard id is a stable hash of the hazard's meaning.

function classify(expr: string, zone: string, fromY: number, toY: number): Hazard[] {
  const parsed = parse(expr, 'vixie');
  if (!parsed.ok) {
    throw new Error('parse failed');
  }
  return classifyHazards(parsed.ast, backend, {
    expression: expr,
    dialect: 'vixie',
    zone,
    from: midnight(fromY, 1),
    to: midnight(toY, 1),
    zoneinfoRoot: ROOT,
  });
}

function kinds(hazards: Hazard[]): string[] {
  return hazards.map((h) => h.kind);
}

describe('phase 4: the classifier reports each hazard kind and a stable hazard id', () => {
  test('a spring-forward point schedule is SKIPPED and a fall-back one is DOUBLED', () => {
    expect(kinds(classify('30 2 * * *', 'America/New_York', 2024, 2025))).toContain('SKIPPED');
    expect(kinds(classify('30 1 * * *', 'America/New_York', 2024, 2025))).toContain('DOUBLED');
  });

  test('an interval schedule reports INTERVAL_DRIFT and a phantom day reports COUNT_ANOMALY', () => {
    expect(kinds(classify('*/15 * * * *', 'America/New_York', 2024, 2025))).toContain('INTERVAL_DRIFT');
    expect(kinds(classify('0 0 * * *', 'Pacific/Apia', 2011, 2012))).toContain('COUNT_ANOMALY');
  });

  test('the hazard id is a stable hash of the hazard meaning, not its line', () => {
    const identity: HazardIdentity = {
      expression: '30 2 * * *',
      dialect: 'vixie',
      zone: 'America/New_York',
      intendedLocal: { year: 2024, month: 3, day: 10, hour: 2, minute: 30, second: 0 },
      kind: 'SKIPPED',
    };
    expect(hazardId(identity)).toBe('hz_feef0ab468b6e246');
  });
});
