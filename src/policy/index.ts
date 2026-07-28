/**
 * Public surface of the scheduler policy models and the differential
 * report. Each model says what a real scheduler does with a firing a
 * zone made nonexistent or ambiguous; the differential runs them all
 * and reports where they disagree, which is a portability hazard
 * distinct from the underlying DST hazard.
 */

export type {
  PolicyId,
  PolicyModel,
  PolicyOutcome,
  PolicyParams,
  ResolvedFiring,
  Verification,
} from './types';
export { outcomeInstants } from './types';
export { isFixedTime, shiftMagnitudeMillis, THREE_HOURS_MILLIS } from './fixed-time';
export {
  ALL_POLICY_IDS,
  policyBasis,
  policyEntry,
  policyModel,
  policyVerification,
} from './registry';
export type { PolicyEntry } from './registry';
export { k8sWouldCatchUp, DEFAULT_K8S_MISSED_LIMIT } from './models/k8s-cronjob';
export { runDifferential, pairRelation } from './differential';
export type {
  DecisionPoint,
  DifferentialInput,
  DifferentialReport,
  PairRelation,
  PolicyCell,
  PolicyColumn,
  PolicyPair,
} from './differential';
