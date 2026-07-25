/**
 * Differential cross-check of the two timezone backends. For each
 * zone, every transition instant and every offset on both sides must
 * agree exactly; any disagreement is a hard failure that identifies
 * the zone and the instant.
 *
 * The comparison runs in both directions. Every transition backend B
 * reads from the TZif table or footer is verified against backend
 * A's offsets one second before the instant and at the instant, so
 * the verification queries A's data directly and does not depend on
 * A's probe-scan granularity. Every transition backend A's scan
 * discovers must in turn exist in B's list with identical offsets,
 * which catches transitions missing from B.
 */

import type { TzBackend, ZoneTransition } from './types';

/** One point of disagreement between the backends. */
export interface CrossCheckDisagreement {
  /** Zone in which the backends disagree. */
  zone: string;
  /** Instant involved, UTC milliseconds, or null for count skew. */
  instant: number | null;
  /** Human-readable description of the disagreement. */
  detail: string;
}

/** Cross-check result for one zone. */
export interface ZoneCheckResult {
  /** The zone that was checked. */
  zone: string;
  /** Transitions found by backend A. */
  countA: number;
  /** Transitions found by backend B. */
  countB: number;
  /**
   * Transitions verified between the backends: every backend B
   * transition, each checked against backend A's offsets on both
   * sides of the instant. Backend A discoveries missing from B are
   * reported as disagreements on top of this count.
   */
  transitionsCompared: number;
  /** All disagreements found in this zone. */
  disagreements: CrossCheckDisagreement[];
}

/** Aggregate result of a cross-check run. */
export interface CrossCheckReport {
  /** Per-zone results in input order. */
  zoneResults: ZoneCheckResult[];
  /** Number of zones checked. */
  zonesChecked: number;
  /** Total transition pairs compared across all zones. */
  transitionsCompared: number;
  /** All disagreements across all zones. */
  disagreements: CrossCheckDisagreement[];
}

function iso(millis: number): string {
  return new Date(millis).toISOString();
}

/** Cross-checks a single zone over [startUtcMillis, endUtcMillis). */
export function crossCheckZone(
  backendA: TzBackend,
  backendB: TzBackend,
  zone: string,
  startUtcMillis: number,
  endUtcMillis: number,
): ZoneCheckResult {
  const listA = backendA.transitionsBetween(startUtcMillis, endUtcMillis, zone);
  const listB = backendB.transitionsBetween(startUtcMillis, endUtcMillis, zone);
  const disagreements: CrossCheckDisagreement[] = [];

  const byInstantB = new Map<number, ZoneTransition>();
  for (const b of listB) {
    byInstantB.set(b.instant, b);
  }

  for (const b of listB) {
    const beforeA = backendA.offsetAt(b.instant - 1000, zone).offsetSeconds;
    const afterA = backendA.offsetAt(b.instant, zone).offsetSeconds;
    if (beforeA !== b.offsetBeforeSeconds) {
      disagreements.push({
        zone,
        instant: b.instant,
        detail:
          `at ${iso(b.instant)}: offset before transition differs, ` +
          `A=${beforeA}s B=${b.offsetBeforeSeconds}s`,
      });
    }
    if (afterA !== b.offsetAfterSeconds) {
      disagreements.push({
        zone,
        instant: b.instant,
        detail:
          `at ${iso(b.instant)}: offset after transition differs, ` +
          `A=${afterA}s B=${b.offsetAfterSeconds}s`,
      });
    }
  }

  for (const a of listA) {
    const match = byInstantB.get(a.instant);
    if (match === undefined) {
      disagreements.push({
        zone,
        instant: a.instant,
        detail: `backend A finds a transition at ${iso(a.instant)} that backend B does not have`,
      });
    } else if (
      match.offsetBeforeSeconds !== a.offsetBeforeSeconds ||
      match.offsetAfterSeconds !== a.offsetAfterSeconds
    ) {
      disagreements.push({
        zone,
        instant: a.instant,
        detail:
          `at ${iso(a.instant)}: offsets differ, ` +
          `A=${a.offsetBeforeSeconds}s/${a.offsetAfterSeconds}s ` +
          `B=${match.offsetBeforeSeconds}s/${match.offsetAfterSeconds}s`,
      });
    }
  }

  return {
    zone,
    countA: listA.length,
    countB: listB.length,
    transitionsCompared: listB.length,
    disagreements,
  };
}

/** Options for {@link runCrossCheck}. */
export interface CrossCheckOptions {
  /** Backend A, conventionally the Intl backend. */
  backendA: TzBackend;
  /** Backend B, conventionally the TZif backend. */
  backendB: TzBackend;
  /** Zones to check. */
  zones: string[];
  /** Range start, UTC milliseconds inclusive. */
  startUtcMillis: number;
  /** Range end, UTC milliseconds exclusive. */
  endUtcMillis: number;
  /** Optional per-zone progress callback. */
  onZone?: (result: ZoneCheckResult) => void;
}

/** Runs the cross-check over every requested zone. */
export function runCrossCheck(options: CrossCheckOptions): CrossCheckReport {
  const zoneResults: ZoneCheckResult[] = [];
  const disagreements: CrossCheckDisagreement[] = [];
  let transitionsCompared = 0;
  for (const zone of options.zones) {
    const result = crossCheckZone(
      options.backendA,
      options.backendB,
      zone,
      options.startUtcMillis,
      options.endUtcMillis,
    );
    zoneResults.push(result);
    disagreements.push(...result.disagreements);
    transitionsCompared += result.transitionsCompared;
    options.onZone?.(result);
  }
  return {
    zoneResults,
    zonesChecked: zoneResults.length,
    transitionsCompared,
    disagreements,
  };
}
