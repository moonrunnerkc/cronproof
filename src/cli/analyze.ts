/**
 * Shared analysis used by the commands: resolving the zoneinfo root,
 * building the timezone backend, the internal verification that
 * guards exit code 3, and flattening a hazard into a view row.
 *
 * The zoneinfo root defaults to the copy vendored with this package,
 * which matches the runtime's ICU tzdb, so a default run does not trip
 * the tzdb-mismatch check. Point --zoneinfo-root at a divergent tree
 * and the mismatch is caught and reported as an internal failure.
 */

import { formatLocal, type Hazard } from '../hazard/index';
import {
  createIntlBackend,
  createTzifBackend,
  crossCheckZone,
  resolveZoneinfoRoot,
  tzdbVersions,
  vendoredZoneinfoRoot,
  wallMillisFromFields,
  type TzifBackend,
} from '../tz/index';
import type { LocalFiring } from '../cron/index';
import type { HazardView } from './types';

const DAY_MILLIS = 86_400_000;

/** Resolves the zoneinfo root: explicit, else vendored, else system. */
export function resolveRoot(explicit: string | null): string {
  if (explicit !== null) {
    return resolveZoneinfoRoot(explicit);
  }
  return vendoredZoneinfoRoot() ?? resolveZoneinfoRoot();
}

/** Creates the TZif backend for a root. */
export function makeBackend(root: string): TzifBackend {
  return createTzifBackend({ zoneinfoRoot: root });
}

/** ISO 8601 UTC string for an instant. */
export function isoUtc(millis: number): string {
  return new Date(millis).toISOString();
}

/**
 * Runs the internal verification that gates exit code 3: the two tzdb
 * sources must agree, and the two independent timezone backends must
 * agree on every transition in the window. Returns null when clean,
 * or a message describing the failure.
 */
export function internalVerification(
  backend: TzifBackend,
  zone: string,
  from: LocalFiring,
  to: LocalFiring,
  root: string,
): string | null {
  const versions = tzdbVersions(root);
  if (
    versions.intlTzdbVersion !== null &&
    versions.zoneinfoTzdbVersion !== null &&
    versions.intlTzdbVersion !== versions.zoneinfoTzdbVersion
  ) {
    return (
      `tzdb mismatch: ICU has ${versions.intlTzdbVersion} but the zoneinfo root ` +
      `${versions.zoneinfoRoot} has ${versions.zoneinfoTzdbVersion}. A verdict computed ` +
      `against a stale tzdb is worth nothing; use a matching --zoneinfo-root.`
    );
  }
  const startUtc = wallMillisFromFields(from) - DAY_MILLIS;
  const endUtc = wallMillisFromFields(to) + DAY_MILLIS;
  const result = crossCheckZone(createIntlBackend(), backend, zone, startUtc, endUtc);
  if (result.disagreements.length > 0) {
    const first = result.disagreements[0];
    return `backend disagreement in ${zone}: ${first?.detail ?? 'unknown'}`;
  }
  return null;
}

function hazardMessage(hazard: Hazard): string {
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
export function severityOrder(severity: HazardView['severity']): number {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
