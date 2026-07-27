/**
 * Types for the timezone hazard classifier. A hazard is what happens
 * when an intended wall-clock firing meets a zone whose offset is not
 * constant across the window: the firing may vanish, double, drift,
 * or land on a calendar day that does not exist, and the region may
 * be a prediction rather than a recorded fact.
 */

import type { DialectId, LocalFiring } from '../cron/index';

/** The six ways a schedule can go wrong across an offset transition. */
export type HazardKind =
  | 'SKIPPED'
  | 'DOUBLED'
  | 'INTERVAL_DRIFT'
  | 'COUNT_ANOMALY'
  | 'ZONE_UNSTABLE';

/** Ordered severity levels; higher ordinal is more severe. */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** The transition responsible for a hazard, when one applies. */
export interface CausingTransition {
  /** Transition instant, UTC milliseconds. */
  instant: number;
  /** UTC offset in seconds just before the transition. */
  offsetBeforeSeconds: number;
  /** UTC offset in seconds at and after the transition. */
  offsetAfterSeconds: number;
  /** offsetAfterSeconds minus offsetBeforeSeconds; positive is a spring-forward gap. */
  deltaSeconds: number;
}

/** Extra fields carried by a SKIPPED hazard. */
export interface SkippedDetail {
  /** First skipped wall value, wall milliseconds. */
  gapStartWallMillis: number;
  /** First wall value after the gap, wall milliseconds. */
  gapEndWallMillis: number;
  /** Length of the skipped wall interval, milliseconds. */
  gapDurationMillis: number;
}

/** Extra fields carried by a DOUBLED hazard. */
export interface DoubledDetail {
  /** Length of the repeated wall interval, milliseconds. */
  foldDurationMillis: number;
}

/** Extra fields carried by an INTERVAL_DRIFT hazard. */
export interface IntervalDriftDetail {
  /** Nominal cadence between firings away from the transition, milliseconds. */
  expectedIntervalMillis: number;
  /** Real interval across the transition for the bracketing pair, milliseconds. */
  actualIntervalMillis: number;
  /** The firing immediately before the transition. */
  before: LocalFiring;
  /** The firing immediately after the transition. */
  after: LocalFiring;
}

/** Extra fields carried by a COUNT_ANOMALY hazard. */
export interface CountAnomalyDetail {
  /** Firings that fire on the anomalous calendar day. */
  dayFiringCount: number;
  /** Modal firing count per active day for this schedule. */
  modalCount: number;
  /** Why the day is structurally anomalous. */
  reason: 'phantom-day' | 'duplicated-day';
}

/** Extra fields carried by a ZONE_UNSTABLE hazard. */
export interface ZoneUnstableDetail {
  /** Why the region is a prediction rather than a recorded fact. */
  reason: 'footer-extrapolation' | 'recent-rule-change';
  /** Instant of the last recorded (table) transition, or null when unknown. */
  lastTableTransitionInstant: number | null;
}

/** Kind-specific payload for a hazard. */
export type HazardDetail =
  | { kind: 'SKIPPED'; skipped: SkippedDetail }
  | { kind: 'DOUBLED'; doubled: DoubledDetail }
  | { kind: 'INTERVAL_DRIFT'; drift: IntervalDriftDetail }
  | { kind: 'COUNT_ANOMALY'; count: CountAnomalyDetail }
  | { kind: 'ZONE_UNSTABLE'; unstable: ZoneUnstableDetail };

/** A classified timezone hazard for one schedule in one zone. */
export interface Hazard {
  /** Stable hash of (expression, dialect, zone, intended local time, kind). */
  id: string;
  /** Classification. */
  kind: HazardKind;
  /** Severity under the configured idempotence assumption. */
  severity: Severity;
  /** Source cron or OnCalendar expression. */
  expression: string;
  /** Dialect the expression was parsed under. */
  dialect: DialectId;
  /** IANA zone the schedule runs in. */
  zone: string;
  /** Intended local firing time (for day-level hazards, the day at 00:00:00). */
  intendedLocal: LocalFiring;
  /** Resolved UTC instants: empty for SKIPPED, one or two otherwise. */
  instants: number[];
  /** Transition responsible for the hazard, or null. */
  causingTransition: CausingTransition | null;
  /** Kind-specific payload. */
  detail: HazardDetail;
}

/** Inputs to the classifier. */
export interface ClassifyInput {
  /** Source expression, used verbatim in the hazard id and output. */
  expression: string;
  /** Dialect the expression was parsed under. */
  dialect: DialectId;
  /** IANA zone to evaluate the schedule in. */
  zone: string;
  /** Inclusive lower bound as naive wall-clock fields. */
  from: LocalFiring;
  /** Exclusive upper bound as naive wall-clock fields. */
  to: LocalFiring;
  /**
   * True when a double execution is harmless (the work is idempotent).
   * Idempotence cannot be inferred from a cron line, so it is an
   * explicit per-schedule input and defaults to false, treating
   * doubles as high-consequence.
   */
  idempotent?: boolean;
  /**
   * Zoneinfo root used to read the recorded transition table for
   * ZONE_UNSTABLE detection. When omitted, footer-extrapolation
   * detection is skipped.
   */
  zoneinfoRoot?: string;
}
