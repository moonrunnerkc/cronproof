/**
 * The registry of scheduler policy models and their verification
 * status. Every entry is ASSERTED in this phase: it was modeled from
 * documentation or, for naive, by definition, and no real scheduler
 * has confirmed it yet. Phase 6 runs the schedulers and only then may
 * change specific entries to VERIFIED. Nothing here defaults to
 * VERIFIED, and the basis string records where each ASSERTED model
 * came from so the CLI can show it and never present it as fact.
 */

import { cronParserLuxonModel } from './models/cron-parser-luxon';
import { cronieModel } from './models/cronie';
import { croniterModel } from './models/croniter';
import { debianCronModel } from './models/debian-cron';
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
  /** VERIFIED (phase 6 confirmed) or ASSERTED (from docs or definition). */
  verification: Verification;
  /** Where the model came from: documentation fetched, or definition. */
  basis: string;
}

const REGISTRY: Record<PolicyId, PolicyEntry> = {
  naive: {
    model: naiveModel,
    verification: 'ASSERTED',
    basis: 'definitional straw model: pure wall-clock iteration, no DST awareness',
  },
  'debian-cron': {
    model: debianCronModel,
    verification: 'ASSERTED',
    basis: 'cron(8) Debian DST paragraph, fetched 2026-07-27 (manpages.debian.org/bookworm/cron/cron.8.en.html)',
  },
  cronie: {
    model: cronieModel,
    verification: 'ASSERTED',
    basis: 'gap and fold UNDEFINED: cronie is a separate codebase, not run in this session; do not assume it matches Debian',
  },
  'k8s-cronjob': {
    model: k8sCronjobModel,
    verification: 'ASSERTED',
    basis: 'kubernetes.io CronJob docs and robfig/cron v3 docs, fetched 2026-07-27; skips gaps, no fold suppression',
  },
  quartz: {
    model: quartzModel,
    verification: 'ASSERTED',
    basis: 'Quartz misfire tutorial, fetched 2026-07-27; misfire parameterized, DST gap and fold UNDEFINED',
  },
  croniter: {
    model: croniterModel,
    verification: 'ASSERTED',
    basis: 'croniter README About DST, fetched 2026-07-27; convention undocumented, gap and fold UNDEFINED',
  },
  'cron-parser-luxon': {
    model: cronParserLuxonModel,
    verification: 'ASSERTED',
    basis: 'cron-parser README, fetched 2026-07-27; DST convention implicit in implementation, gap and fold UNDEFINED',
  },
  'node-cron': {
    model: nodeCronModel,
    verification: 'ASSERTED',
    basis: 'node-cron README Timezones and DST, fetched 2026-07-27; fold fires once, gap pauses',
  },
  'systemd-timer': {
    model: systemdTimerModel,
    verification: 'ASSERTED',
    basis: 'systemd.timer(5) Persistent=, fetched 2026-07-27; Persistent parameterized, DST gap and fold UNDEFINED',
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
  'cron-parser-luxon',
  'node-cron',
  'systemd-timer',
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
