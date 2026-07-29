import { describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import { ALL_POLICY_IDS, policyVerification, runDifferential } from '../../src/policy/index';
import { backend, midnight } from './support';

// Phase 5 built the scheduler policy models. Criteria reconstructed from
// the phase-5 DECISIONS entries: ten models each tagged VERIFIED or
// ASSERTED, and a differential that reports disagreement. The criterion
// is that those ten are registered and tagged, not that ten is the final
// count: later phases add schedulers, and an acceptance test that froze
// the total would fail on every addition without a criterion regressing.
const PHASE_5_POLICIES = [
  'naive',
  'debian-cron',
  'cronie',
  'k8s-cronjob',
  'quartz',
  'croniter',
  'cronsim',
  'cron-parser-luxon',
  'node-cron',
  'systemd-timer',
] as const;

describe('phase 5: ten tagged policy models and a differential that flags disagreement', () => {
  test('all ten phase 5 policies are registered, each tagged VERIFIED or ASSERTED', () => {
    for (const id of PHASE_5_POLICIES) {
      expect(ALL_POLICY_IDS).toContain(id);
      expect(['VERIFIED', 'ASSERTED']).toContain(policyVerification(id));
    }
  });

  test('the Berlin fall-back is a disagreement: k8s fires twice, debian once', () => {
    const parsed = parse('30 2 * * *', 'vixie');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const report = runDifferential({
      ast: parsed.ast,
      expression: '30 2 * * *',
      dialect: 'vixie',
      zone: 'Europe/Berlin',
      from: midnight(2023, 10, 28),
      to: midnight(2023, 10, 30),
      backend,
    });
    expect(report.verdict).toBe('disagreement');
    const k8s = report.columns.find((c) => c.policyId === 'k8s-cronjob');
    const debian = report.columns.find((c) => c.policyId === 'debian-cron');
    expect(k8s?.hazardFiringCount).toBe(2);
    expect(debian?.hazardFiringCount).toBe(1);
  });
});
