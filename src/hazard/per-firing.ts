/**
 * Per-firing hazards for point schedules: a firing that lands in a
 * spring-forward gap is SKIPPED, and one that lands in a fall-back
 * fold is DOUBLED. Interval-like schedules do not use this path;
 * their transition effects are reported as INTERVAL_DRIFT instead.
 */

import type { TzBackend } from '../tz/index';
import type { ResolvedFiring } from './resolve-firings';
import { foldTransition, transitionAtInstant } from './transitions';
import type { Hazard } from './types';
import { makeHazard } from './build-hazard';

/** Classifies SKIPPED and DOUBLED firings for a point schedule. */
export function perFiringHazards(
  resolved: ResolvedFiring[],
  expression: string,
  dialect: Hazard['dialect'],
  zone: string,
  backend: TzBackend,
  idempotent: boolean,
): Hazard[] {
  const hazards: Hazard[] = [];
  for (const firing of resolved) {
    const resolution = firing.resolution;
    if (resolution.kind === 'nonexistent') {
      hazards.push(
        makeHazard({
          kind: 'SKIPPED',
          expression,
          dialect,
          zone,
          intendedLocal: firing.local,
          instants: [],
          causingTransition: transitionAtInstant(backend, zone, resolution.transitionInstant),
          idempotent,
          detail: {
            kind: 'SKIPPED',
            skipped: {
              gapStartWallMillis: resolution.gapStartWallMillis,
              gapEndWallMillis: resolution.gapEndWallMillis,
              gapDurationMillis: resolution.gapDurationMilliseconds,
            },
          },
        }),
      );
    } else if (resolution.kind === 'ambiguous') {
      hazards.push(
        makeHazard({
          kind: 'DOUBLED',
          expression,
          dialect,
          zone,
          intendedLocal: firing.local,
          instants: [resolution.earlierInstant, resolution.laterInstant],
          causingTransition: foldTransition(
            backend,
            zone,
            resolution.earlierInstant,
            resolution.laterInstant,
          ),
          idempotent,
          detail: {
            kind: 'DOUBLED',
            doubled: { foldDurationMillis: resolution.foldDurationMilliseconds },
          },
        }),
      );
    }
  }
  return hazards;
}
