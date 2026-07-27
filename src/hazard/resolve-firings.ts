/**
 * Bridges the enumerator and the resolver: turns intended wall-clock
 * firings into resolved firings, each carrying its wall-milliseconds
 * key and the three-way resolution. Detectors that need to know
 * whether individual firings exist, double, or vanish consume this.
 */

import { enumerate, type CronAst, type LocalFiring } from '../cron/index';
import {
  resolveWallClock,
  wallMillisFromFields,
  type TzBackend,
  type WallClockResolution,
} from '../tz/index';

/** An intended firing paired with its wall key and resolution. */
export interface ResolvedFiring {
  /** Intended local firing time. */
  local: LocalFiring;
  /** The local fields encoded as wall milliseconds. */
  wallMillis: number;
  /** How the local time resolves in the zone. */
  resolution: WallClockResolution;
}

/** Enumerates intended firings across the window, in wall order. */
export function enumerateFirings(
  ast: CronAst,
  zone: string,
  from: LocalFiring,
  to: LocalFiring,
): LocalFiring[] {
  return enumerate(ast, { zone, from, to });
}

/** Resolves each intended firing through the timezone engine. */
export function resolveFirings(
  firings: LocalFiring[],
  zone: string,
  backend: TzBackend,
): ResolvedFiring[] {
  return firings.map((local) => ({
    local,
    wallMillis: wallMillisFromFields(local),
    resolution: resolveWallClock(local, zone, backend),
  }));
}
