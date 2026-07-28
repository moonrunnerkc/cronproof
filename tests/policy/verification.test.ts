import { describe, expect, test } from 'vitest';
import { ALL_POLICY_IDS, policyBasis, policyVerification } from '../../src/policy/index';
import type { PolicyId } from '../../src/policy/index';

// After phase 6, only the two models with no real scheduler to run are
// ASSERTED: naive (a definition) and quartz (needs a JVM, not run).
const STILL_ASSERTED = new Set<PolicyId>(['naive', 'quartz']);

describe('verification status after phase 6', () => {
  test('every model backed by a real run is VERIFIED, and only naive and quartz remain ASSERTED', () => {
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

  test('all ten schedulers are registered', () => {
    expect(ALL_POLICY_IDS).toHaveLength(10);
    expect(new Set(ALL_POLICY_IDS).size).toBe(10);
  });
});
