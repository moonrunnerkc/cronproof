import { describe, expect, test } from 'vitest';
import { computeMetrics, isHeadlineK8s, k8sDebianDiffer } from '../../research/src/metrics';
import type { AnalyzedSchedule } from '../../research/src/types';

function schedule(over: Partial<AnalyzedSchedule>): AnalyzedSchedule {
  return {
    repo: 'o/r',
    path: 'k8s.yaml',
    sha: 'sha',
    sourceKind: 'k8s-cronjob',
    dialect: 'k8s',
    expression: '30 2 * * *',
    zone: 'America/New_York',
    zoneSourceKind: 'explicit',
    parsed: true,
    zoneResolvable: true,
    hazardKinds: [],
    firesInTransitionWindow: false,
    k8sFiringCount: 0,
    debianFiringCount: 0,
    ...over,
  };
}

describe('the headline population is exactly explicit non-UTC k8s CronJobs', () => {
  test('a UTC-zoned or inherited-zone or unparsed k8s CronJob is not in the headline denominator', () => {
    expect(isHeadlineK8s(schedule({ zone: 'UTC' }))).toBe(false);
    expect(isHeadlineK8s(schedule({ zone: 'Etc/UTC' }))).toBe(false);
    expect(isHeadlineK8s(schedule({ zoneSourceKind: 'inherited' }))).toBe(false);
    expect(isHeadlineK8s(schedule({ parsed: false, k8sFiringCount: null, debianFiringCount: null }))).toBe(false);
    expect(isHeadlineK8s(schedule({ sourceKind: 'crontab' }))).toBe(false);
    expect(isHeadlineK8s(schedule({ zone: 'America/New_York' }))).toBe(true);
  });
});

describe('a differing firing count is the portability defect', () => {
  test('k8sDebianDiffer is true only when both counts exist and differ', () => {
    expect(k8sDebianDiffer(schedule({ k8sFiringCount: 1, debianFiringCount: 2 }))).toBe(true);
    expect(k8sDebianDiffer(schedule({ k8sFiringCount: 2, debianFiringCount: 2 }))).toBe(false);
    expect(k8sDebianDiffer(schedule({ k8sFiringCount: null, debianFiringCount: 2 }))).toBe(false);
  });
});

describe('computeMetrics keeps every rate as numerator over denominator', () => {
  test('the headline counts differing k8s CronJobs over the explicit non-UTC k8s population', () => {
    const schedules: AnalyzedSchedule[] = [
      schedule({ k8sFiringCount: 1, debianFiringCount: 2, hazardKinds: ['SKIPPED'], firesInTransitionWindow: true }),
      schedule({ k8sFiringCount: 0, debianFiringCount: 1, hazardKinds: ['SKIPPED'], firesInTransitionWindow: true }),
      schedule({ k8sFiringCount: 2, debianFiringCount: 2 }),
      schedule({ zone: 'UTC', k8sFiringCount: 0, debianFiringCount: 0 }),
      schedule({ sourceKind: 'crontab', dialect: 'vixie', zone: 'Europe/Berlin', zoneSourceKind: 'inherited', hazardKinds: ['DOUBLED'], firesInTransitionWindow: true, k8sFiringCount: 1, debianFiringCount: 1 }),
      schedule({ parsed: false, zone: 'Asia/Tokyo', k8sFiringCount: null, debianFiringCount: null }),
      schedule({ zone: null, zoneSourceKind: 'unknown', parsed: false, k8sFiringCount: null, debianFiringCount: null }),
    ];
    const metrics = computeMetrics(schedules);

    // Headline denominator: the three explicit non-UTC parsed k8s with counts.
    expect(metrics.headline).toEqual({ numerator: 2, denominator: 3 });
    // Analyzable: parsed and concrete zone. Excludes the unparsed and the unknown-zone rows.
    expect(metrics.analyzable).toBe(5);
    expect(metrics.unknownZone).toBe(1);
    expect(metrics.unparsed).toBe(1);
    // Transition window: three of the five analyzable fire in a window.
    expect(metrics.transitionWindow).toEqual({ numerator: 3, denominator: 5 });
    expect(metrics.extracted).toBe(7);
  });

  test('the hazard distribution and top zones count analyzable schedules per kind and zone', () => {
    const schedules: AnalyzedSchedule[] = [
      schedule({ zone: 'America/New_York', hazardKinds: ['SKIPPED', 'DOUBLED'] }),
      schedule({ zone: 'America/New_York', hazardKinds: ['SKIPPED'] }),
      schedule({ zone: 'Europe/Berlin', hazardKinds: ['DOUBLED'] }),
      schedule({ zone: 'UTC', hazardKinds: [] }),
    ];
    const metrics = computeMetrics(schedules);
    const skipped = metrics.hazardDistribution.find((row) => row.kind === 'SKIPPED');
    const doubled = metrics.hazardDistribution.find((row) => row.kind === 'DOUBLED');
    expect(skipped?.count).toBe(2);
    expect(doubled?.count).toBe(2);
    expect(metrics.topZones[0]).toEqual({ zone: 'America/New_York', hazardSchedules: 2 });
  });
});
