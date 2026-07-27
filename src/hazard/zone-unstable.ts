/**
 * ZONE_UNSTABLE: labels the region of a window that is a prediction
 * rather than a recorded fact. The concrete, checkable boundary is
 * the last transition in the zone's compiled table: firings past it
 * are governed by the POSIX footer, which extrapolates a DST rule
 * into the future. When the footer defines no DST (a constant
 * offset), extrapolation is exact and no label is warranted.
 *
 * Detecting a rule that changed in a recent tzdb release needs a diff
 * between tzdb versions, which is out of scope for this phase; that
 * reason is modeled in the type but not emitted here. See
 * DECISIONS.md, phase 4.
 */

import {
  parsePosixTz,
  parseTzif,
  readZoneFile,
  wallMillisFromFields,
} from '../tz/index';
import type { DialectId, LocalFiring } from '../cron/index';
import { makeHazard } from './build-hazard';
import type { Hazard } from './types';

interface FooterBoundary {
  lastTableTransition: number;
  footerHasDst: boolean;
}

function footerBoundary(zoneinfoRoot: string, zone: string): FooterBoundary | null {
  let data;
  try {
    data = parseTzif(readZoneFile(zoneinfoRoot, zone));
  } catch {
    return null;
  }
  if (data.transitionMillis.length === 0) {
    return null;
  }
  const last = data.transitionMillis[data.transitionMillis.length - 1] ?? null;
  if (last === null) {
    return null;
  }
  const posix = data.posixTzString === null ? null : parsePosixTz(data.posixTzString);
  return { lastTableTransition: last, footerHasDst: posix !== null && posix.dstStart !== null };
}

/**
 * Emits a single ZONE_UNSTABLE label when the window has firings past
 * the last recorded transition and the footer extrapolates a DST
 * rule. Returns nothing when no root was supplied, the zone cannot be
 * read, the footer is a constant offset, or no firing reaches the
 * predicted region.
 */
export function zoneUnstableHazards(
  firings: LocalFiring[],
  expression: string,
  dialect: DialectId,
  zone: string,
  zoneinfoRoot: string | undefined,
  idempotent: boolean,
): Hazard[] {
  if (zoneinfoRoot === undefined) {
    return [];
  }
  const boundary = footerBoundary(zoneinfoRoot, zone);
  if (boundary === null || !boundary.footerHasDst) {
    return [];
  }
  const firstBeyond = firings.find(
    (firing) => wallMillisFromFields(firing) >= boundary.lastTableTransition,
  );
  if (firstBeyond === undefined) {
    return [];
  }
  return [
    makeHazard({
      kind: 'ZONE_UNSTABLE',
      expression,
      dialect,
      zone,
      intendedLocal: firstBeyond,
      instants: [],
      causingTransition: null,
      idempotent,
      detail: {
        kind: 'ZONE_UNSTABLE',
        unstable: {
          reason: 'footer-extrapolation',
          lastTableTransitionInstant: boundary.lastTableTransition,
        },
      },
    }),
  ];
}
