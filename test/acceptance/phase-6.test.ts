import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ALL_POLICY_IDS, policyEntry } from '../../src/policy/index';
import type { PolicyId } from '../../src/policy/index';
import { REPO_ROOT } from './support';

// Phase 6 verified the models against real runs. Criteria reconstructed
// from the phase-6 DECISIONS entries and FINDINGS.md: every VERIFIED model
// rests on a committed fixture that records a scheduler version and the
// observed fire sequence, produced by a real-software observation harness.

const FIXTURE_BY_ID: Partial<Record<PolicyId, string>> = {
  'debian-cron': 'debian-cron.json',
  cronie: 'cronie.json',
  'k8s-cronjob': 'k8s-cronjob.json',
  croniter: 'croniter.json',
  cronsim: 'cronsim.json',
  'cron-parser-luxon': 'cron-parser-luxon.json',
  'node-cron': 'node-cron.json',
  'systemd-timer': 'systemd-timer.json',
};

interface Fixture {
  schedulerVersion?: string;
  scenarios?: { observedFireInstantsUtc?: unknown }[];
}

describe('phase 6: every VERIFIED policy rests on a real, non-empty fixture', () => {
  test('each VERIFIED policy has a committed fixture with a scheduler version and observed instants', () => {
    for (const id of ALL_POLICY_IDS) {
      if (policyEntry(id).verification !== 'VERIFIED') {
        continue;
      }
      const name = FIXTURE_BY_ID[id];
      expect(name, `VERIFIED policy ${id} must map to a fixture`).toBeDefined();
      const file = path.join(REPO_ROOT, 'test', 'differential', 'fixtures', name ?? '');
      expect(existsSync(file), `fixture ${name} must exist`).toBe(true);
      const fixture = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
      expect(typeof fixture.schedulerVersion === 'string' && fixture.schedulerVersion.length > 0).toBe(true);
      expect((fixture.scenarios ?? []).length).toBeGreaterThan(0);
      for (const scenario of fixture.scenarios ?? []) {
        expect(Array.isArray(scenario.observedFireInstantsUtc)).toBe(true);
      }
    }
  });

  test('naive and quartz stay ASSERTED, with no fixture claimed', () => {
    expect(policyEntry('naive').verification).toBe('ASSERTED');
    expect(policyEntry('quartz').verification).toBe('ASSERTED');
    expect(FIXTURE_BY_ID.naive).toBeUndefined();
    expect(FIXTURE_BY_ID.quartz).toBeUndefined();
  });
});
