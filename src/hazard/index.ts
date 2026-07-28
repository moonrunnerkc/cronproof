/**
 * Public surface of the timezone hazard classifier. It takes intended
 * wall-clock firings from the enumerator, resolves them through the
 * timezone engine, and classifies each hazard with a stable id and a
 * severity that reflects whether the work is idempotent.
 */

export { classifyHazards, classifyExpression, isIntervalLike } from './classify';
export { hazardId, formatLocal } from './hazard-id';
export type { HazardIdentity } from './hazard-id';
export { sha256Hex } from './sha256';
export { severityFor, severityRank } from './severity';
export type {
  CausingTransition,
  ClassifyInput,
  CountAnomalyDetail,
  DoubledDetail,
  Hazard,
  HazardDetail,
  HazardKind,
  IntervalDriftDetail,
  Severity,
  SkippedDetail,
  ZoneUnstableDetail,
} from './types';
