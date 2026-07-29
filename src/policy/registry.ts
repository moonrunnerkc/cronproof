/**
 * The registry of scheduler policy models, their verification status,
 * and where each came from. Phase 6 ran the real schedulers and
 * flipped the models it confirmed to VERIFIED, each backed by a
 * committed fixture under test/differential/fixtures. Three entries
 * remain ASSERTED: naive is a definitional straw model with no real
 * scheduler to run; quartz was not run (it needs a JVM and a live
 * Quartz scheduler), so its DST branches stay UNDEFINED; and
 * github-actions is read from GitHub's published rule, since running
 * it means waiting on a hosted scheduler through a real transition.
 * Nothing is VERIFIED without a fixture, and the basis records the
 * evidence so the CLI can show it.
 */

import { cronParserLuxonModel } from './models/cron-parser-luxon';
import { cronieModel } from './models/cronie';
import { croniterModel } from './models/croniter';
import { cronsimModel } from './models/cronsim';
import { debianCronModel } from './models/debian-cron';
import { githubActionsModel } from './models/github-actions';
import { k8sCronjobModel } from './models/k8s-cronjob';
import { naiveModel } from './models/naive';
import { nodeCronModel } from './models/node-cron';
import { quartzModel } from './models/quartz';
import { systemdTimerModel } from './models/systemd-timer';
import type { PolicyId, PolicyModel, Verification } from './types';

/** A registered policy: its model, verification status, and basis. */
export interface PolicyEntry {
  /** The behavior model. */
  model: PolicyModel;
  /** VERIFIED (phase 6 confirmed against a real run) or ASSERTED. */
  verification: Verification;
  /** Where the model came from: a fixture, documentation, or definition. */
  basis: string;
}

const REGISTRY: Record<PolicyId, PolicyEntry> = {
  naive: {
    model: naiveModel,
    verification: 'ASSERTED',
    basis: 'definitional straw model: pure wall-clock iteration; no real scheduler exists to verify against',
  },
  'debian-cron': {
    model: debianCronModel,
    verification: 'VERIFIED',
    basis: 'fixture debian-cron.json: cron 3.0pl1 under libfaketime, both transitions, Berlin and New York',
  },
  cronie: {
    model: cronieModel,
    verification: 'VERIFIED',
    basis: 'fixture cronie.json: cronie 1.7.2 on Fedora under libfaketime; behavior identical to debian-cron',
  },
  'k8s-cronjob': {
    model: k8sCronjobModel,
    verification: 'VERIFIED',
    basis: 'fixture k8s-cronjob.json: robfig/cron v3 (the controller parser) Next() sequence, both transitions',
  },
  quartz: {
    model: quartzModel,
    verification: 'ASSERTED',
    basis: 'not run (needs a JVM and a live Quartz scheduler); misfire parameterized, DST gap and fold UNDEFINED',
  },
  croniter: {
    model: croniterModel,
    verification: 'VERIFIED',
    basis: 'fixture croniter.json: croniter 6.2.4 sequence; fold fires twice even for a daily job (see FINDINGS.md)',
  },
  cronsim: {
    model: cronsimModel,
    verification: 'VERIFIED',
    basis: 'fixture cronsim.json: cronsim 2.7 sequence; fold once, gap at the transition, like debian-cron',
  },
  'cron-parser-luxon': {
    model: cronParserLuxonModel,
    verification: 'VERIFIED',
    basis: 'fixture cron-parser-luxon.json: cron-parser 4.9.0; a skipped time is shifted forward (see FINDINGS.md)',
  },
  'node-cron': {
    model: nodeCronModel,
    verification: 'VERIFIED',
    basis: 'fixture node-cron.json: node-cron 3.0.3 scheduler under a virtual clock; fold once, gap dropped',
  },
  'systemd-timer': {
    model: systemdTimerModel,
    verification: 'VERIFIED',
    basis: 'fixture systemd-timer.json: systemd-analyze calendar 249; monotonic, fold once, gap dropped',
  },
  'github-actions': {
    model: githubActionsModel,
    verification: 'ASSERTED',
    basis: 'docs.github.com events-that-trigger-workflows (fetched 2026-07-29): a skipped fixed time advances to the next valid time, 2:30 AM to 3:00 AM; the fold and the multi-slot interval gap are undocumented and stay UNDEFINED',
  },
};

/** Every registered policy id, in a stable order. */
export const ALL_POLICY_IDS: PolicyId[] = [
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

/** Returns the registry entry for a policy id. */
export function policyEntry(id: PolicyId): PolicyEntry {
  return REGISTRY[id];
}

/** Returns the behavior model for a policy id. */
export function policyModel(id: PolicyId): PolicyModel {
  return REGISTRY[id].model;
}

/** Returns the verification status for a policy id. */
export function policyVerification(id: PolicyId): Verification {
  return REGISTRY[id].verification;
}

/** Returns the basis note for a policy id. */
export function policyBasis(id: PolicyId): string {
  return REGISTRY[id].basis;
}
