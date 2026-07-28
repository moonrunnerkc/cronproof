/**
 * Pure, browser-safe flattening of a classified hazard into a render
 * row, plus the small helpers the CLI and the web playground both use.
 * Nothing here touches the filesystem or node builtins, so the same
 * code produces the same view in a terminal and in a browser tab.
 */

import { formatLocal, type Hazard, type HazardKind, type Severity } from '../hazard/index';

/** A hazard flattened for rendering, independent of classifier internals. */
export interface HazardView {
  /** Stable hazard id. */
  id: string;
  /** Classification. */
  kind: HazardKind;
  /** Severity. */
  severity: Severity;
  /** IANA zone. */
  zone: string;
  /** Source expression. */
  expression: string;
  /** Intended local time, ISO without offset. */
  localIso: string;
  /** Resolved UTC instants, ISO. */
  instantsUtc: string[];
  /** One-line human message. */
  message: string;
}

/** ISO 8601 UTC string for an instant in milliseconds. */
export function isoUtc(millis: number): string {
  return new Date(millis).toISOString();
}

/** A one-line human explanation of a hazard, keyed off its detail. */
export function hazardMessage(hazard: Hazard): string {
  const detail = hazard.detail;
  switch (detail.kind) {
    case 'SKIPPED':
      return `local time does not exist (spring-forward gap of ${detail.skipped.gapDurationMillis / 60000}m); run is skipped`;
    case 'DOUBLED':
      return `local time occurs twice (fall-back fold of ${detail.doubled.foldDurationMillis / 60000}m); run may double`;
    case 'INTERVAL_DRIFT':
      return `interval drifts from ${detail.drift.expectedIntervalMillis / 60000}m to ${detail.drift.actualIntervalMillis / 60000}m across the transition`;
    case 'COUNT_ANOMALY':
      return `calendar day fires ${detail.count.dayFiringCount} times vs modal ${detail.count.modalCount} (${detail.count.reason})`;
    case 'ZONE_UNSTABLE':
      return `region past the last recorded transition; ${detail.unstable.reason}, a prediction not a fact`;
  }
}

/** Flattens a hazard into a render-ready view row. */
export function hazardToView(hazard: Hazard): HazardView {
  return {
    id: hazard.id,
    kind: hazard.kind,
    severity: hazard.severity,
    zone: hazard.zone,
    expression: hazard.expression,
    localIso: formatLocal(hazard.intendedLocal),
    instantsUtc: hazard.instants.map(isoUtc),
    message: hazardMessage(hazard),
  };
}

/** Ranks a severity for threshold comparison; higher is more severe. */
export function severityOrder(severity: Severity): number {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
