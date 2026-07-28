import { describe, expect, test } from 'vitest';
import { ALL_POLICY_IDS, policyBasis, policyVerification } from '../../src/policy/index';

describe('verification discipline', () => {
  test('no model defaults to VERIFIED in this phase; every model is ASSERTED', () => {
    for (const id of ALL_POLICY_IDS) {
      expect(policyVerification(id), `${id} must be ASSERTED before phase 6 runs it`).toBe('ASSERTED');
    }
  });

  test('every model records a non-empty basis so the CLI can show where it came from', () => {
    for (const id of ALL_POLICY_IDS) {
      expect(policyBasis(id).length, `${id} needs a basis`).toBeGreaterThan(0);
    }
  });

  test('all nine schedulers are registered', () => {
    expect(ALL_POLICY_IDS).toHaveLength(9);
    expect(new Set(ALL_POLICY_IDS).size).toBe(9);
  });
});
