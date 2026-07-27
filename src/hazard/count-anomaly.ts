/**
 * COUNT_ANOMALY: a calendar day whose firing count differs from the
 * schedule's modal daily count because the day itself is structurally
 * anomalous, a calendar day that does not exist (every wall time is
 * skipped) or, in principle, one that is fully duplicated. This is
 * the safety net that catches a whole missing day, which a per-firing
 * check reports only as one more skipped firing among many.
 */

import { resolveWallClock, type TzBackend } from '../tz/index';
import type { DialectId, LocalFiring } from '../cron/index';
import { makeHazard } from './build-hazard';
import type { ResolvedFiring } from './resolve-firings';
import type { CountAnomalyDetail, Hazard } from './types';

interface DayGroup {
  local: LocalFiring;
  firingCount: number;
}

function dayKey(local: LocalFiring): string {
  return `${local.year}-${local.month}-${local.day}`;
}

function modalCount(groups: DayGroup[]): number {
  const counts = new Map<number, number>();
  for (const group of groups) {
    counts.set(group.firingCount, (counts.get(group.firingCount) ?? 0) + 1);
  }
  let best = 0;
  let bestFreq = -1;
  for (const [count, freq] of counts) {
    if (freq > bestFreq) {
      best = count;
      bestFreq = freq;
    }
  }
  return best;
}

function structuralReason(
  local: LocalFiring,
  zone: string,
  backend: TzBackend,
): CountAnomalyDetail['reason'] | null {
  const noon = { year: local.year, month: local.month, day: local.day, hour: 12, minute: 0, second: 0 };
  const resolution = resolveWallClock(noon, zone, backend);
  if (resolution.kind === 'nonexistent') {
    return 'phantom-day';
  }
  if (resolution.kind === 'ambiguous') {
    return 'duplicated-day';
  }
  return null;
}

/** Emits COUNT_ANOMALY for structurally anomalous calendar days. */
export function countAnomalyHazards(
  resolved: ResolvedFiring[],
  expression: string,
  dialect: DialectId,
  zone: string,
  backend: TzBackend,
  idempotent: boolean,
): Hazard[] {
  const groups = new Map<string, DayGroup>();
  for (const firing of resolved) {
    const key = dayKey(firing.local);
    const midnight = {
      year: firing.local.year,
      month: firing.local.month,
      day: firing.local.day,
      hour: 0,
      minute: 0,
      second: 0,
    };
    const group = groups.get(key) ?? { local: midnight, firingCount: 0 };
    if (firing.resolution.kind !== 'nonexistent') {
      group.firingCount += 1;
    }
    groups.set(key, group);
  }

  const list = [...groups.values()];
  const modal = modalCount(list);
  const hazards: Hazard[] = [];
  for (const group of list) {
    if (group.firingCount === modal) {
      continue;
    }
    const reason = structuralReason(group.local, zone, backend);
    if (reason === null) {
      continue;
    }
    hazards.push(
      makeHazard({
        kind: 'COUNT_ANOMALY',
        expression,
        dialect,
        zone,
        intendedLocal: group.local,
        instants: [],
        causingTransition: null,
        idempotent,
        detail: {
          kind: 'COUNT_ANOMALY',
          count: { dayFiringCount: group.firingCount, modalCount: modal, reason },
        },
      }),
    );
  }
  return hazards;
}
