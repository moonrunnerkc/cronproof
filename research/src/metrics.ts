/**
 * Metric computation, separated from rendering so the numbers can be
 * tested directly. Every metric carries its denominator: a rate is
 * always {numerator, denominator}, never a bare percentage, so the
 * report can never show a fraction whose base is hidden.
 */

import type { AnalyzedSchedule } from './types';

/** A rate with its numerator and denominator kept visible. */
export interface Rate {
  /** How many met the condition. */
  numerator: number;
  /** The base the numerator is out of. */
  denominator: number;
}

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'Z', '+00:00', '00:00', 'Etc/Universal']);

/** Whether a zone string denotes UTC or a UTC-equivalent fixed offset. */
export function isUtcZone(zone: string): boolean {
  return UTC_ZONES.has(zone);
}

/** A schedule that can be evaluated: parsed, with a concrete, loadable zone. */
export function isAnalyzable(schedule: AnalyzedSchedule): boolean {
  return schedule.parsed && schedule.zone !== null && schedule.zoneResolvable;
}

/**
 * The headline population: public Kubernetes CronJobs with an explicit,
 * non-UTC timeZone whose expression parsed and whose k8s and debian
 * firing counts were both computed.
 */
export function isHeadlineK8s(schedule: AnalyzedSchedule): boolean {
  return (
    schedule.sourceKind === 'k8s-cronjob' &&
    schedule.zoneSourceKind === 'explicit' &&
    schedule.zone !== null &&
    !isUtcZone(schedule.zone) &&
    schedule.parsed &&
    schedule.zoneResolvable &&
    schedule.k8sFiringCount !== null &&
    schedule.debianFiringCount !== null
  );
}

/** True when the k8s controller and debian-cron fire a different count. */
export function k8sDebianDiffer(schedule: AnalyzedSchedule): boolean {
  return (
    schedule.k8sFiringCount !== null &&
    schedule.debianFiringCount !== null &&
    schedule.k8sFiringCount !== schedule.debianFiringCount
  );
}

/** The full set of computed metrics, all with denominators. */
export interface Metrics {
  /** Total schedules extracted from the corpus. */
  extracted: number;
  /** Count of schedules per sourceKind, sorted by kind. */
  bySource: { sourceKind: string; count: number }[];
  /** Schedules that could be evaluated (parsed with a concrete zone). */
  analyzable: number;
  /** Schedules whose zone was not knowable from source. */
  unknownZone: number;
  /** Schedules with a concrete zone whose expression did not parse. */
  unparsed: number;
  /** Schedules with a concrete zone that is not a loadable IANA zone. */
  invalidZone: number;
  /** Headline: k8s CronJobs, explicit non-UTC zone, differing firing count. */
  headline: Rate;
  /** Secondary: analyzable schedules firing inside a transition window. */
  transitionWindow: Rate;
  /** Count of analyzable schedules carrying each hazard kind. */
  hazardDistribution: { kind: string; count: number }[];
  /** Top zones by number of schedules with at least one hazard. */
  topZones: { zone: string; hazardSchedules: number }[];
  /** k8s-cronjob vs debian-cron differing count over all analyzable k8s. */
  k8sVsDebianAllZones: Rate;
}

const ALL_HAZARD_KINDS = ['SKIPPED', 'DOUBLED', 'INTERVAL_DRIFT', 'COUNT_ANOMALY', 'ZONE_UNSTABLE'];

function countBy<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Computes every metric from the analyzed schedules. */
export function computeMetrics(schedules: AnalyzedSchedule[]): Metrics {
  const analyzable = schedules.filter(isAnalyzable);
  const headlinePop = schedules.filter(isHeadlineK8s);
  const k8sAll = analyzable.filter(
    (s) => s.sourceKind === 'k8s-cronjob' && s.k8sFiringCount !== null && s.debianFiringCount !== null,
  );
  const hazardSchedules = analyzable.filter((s) => s.hazardKinds.length > 0);

  return {
    extracted: schedules.length,
    bySource: countBy(schedules, (s) => s.sourceKind).map((row) => ({ sourceKind: row.key, count: row.count })),
    analyzable: analyzable.length,
    unknownZone: schedules.filter((s) => s.zone === null).length,
    unparsed: schedules.filter((s) => s.zone !== null && !s.parsed).length,
    invalidZone: schedules.filter((s) => s.zone !== null && s.parsed && !s.zoneResolvable).length,
    headline: {
      numerator: headlinePop.filter(k8sDebianDiffer).length,
      denominator: headlinePop.length,
    },
    transitionWindow: {
      numerator: analyzable.filter((s) => s.firesInTransitionWindow).length,
      denominator: analyzable.length,
    },
    hazardDistribution: ALL_HAZARD_KINDS.map((kind) => ({
      kind,
      count: analyzable.filter((s) => s.hazardKinds.includes(kind)).length,
    })),
    topZones: countBy(hazardSchedules, (s) => s.zone ?? '(unknown)')
      .slice(0, 10)
      .map((row) => ({ zone: row.key, hazardSchedules: row.count })),
    k8sVsDebianAllZones: {
      numerator: k8sAll.filter(k8sDebianDiffer).length,
      denominator: k8sAll.length,
    },
  };
}
