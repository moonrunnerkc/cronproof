import { describe, expect, test } from 'vitest';
import { ALL_POLICY_IDS, policyBasis, policyVerification } from '../../src/policy/index';
import type { PolicyId } from '../../src/policy/index';

// The models with no real scheduler run behind them: naive (a
// definition), quartz (needs a JVM and a live scheduler), and
// github-actions (read from GitHub's published rule, since running it
// means waiting on a hosted scheduler through a real DST transition).
const STILL_ASSERTED = new Set<PolicyId>(['naive', 'quartz', 'github-actions']);

const REGISTERED: PolicyId[] = [
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
  'github-actions',
];

describe('verification status after phase 6', () => {
  test('every model backed by a real run is VERIFIED, and only the unrunnable ones are ASSERTED', () => {
    for (const id of ALL_POLICY_IDS) {
      const expected = STILL_ASSERTED.has(id) ? 'ASSERTED' : 'VERIFIED';
      expect(policyVerification(id), `${id} should be ${expected}`).toBe(expected);
    }
  });

  test('no model is VERIFIED without a basis pointing at its evidence', () => {
    for (const id of ALL_POLICY_IDS) {
      const basis = policyBasis(id);
      expect(basis.length, `${id} needs a basis`).toBeGreaterThan(0);
      if (policyVerification(id) === 'VERIFIED') {
        expect(basis, `${id} VERIFIED basis should cite a fixture`).toContain('fixture');
      }
    }
  });

  test('the registry holds exactly the modeled schedulers, with no duplicates', () => {
    expect([...ALL_POLICY_IDS].sort()).toEqual([...REGISTERED].sort());
    expect(new Set(ALL_POLICY_IDS).size).toBe(ALL_POLICY_IDS.length);
  });
});
