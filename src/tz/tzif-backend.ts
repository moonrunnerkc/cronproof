/**
 * Backend B: resolves offsets and transitions by reading compiled
 * zoneinfo (TZif) files directly. Uses the 64-bit transition table
 * for instants the table covers and the POSIX TZ footer string for
 * extrapolation past the last recorded transition.
 */

import { civilFromDays, DAY_MILLIS } from './civil-date';
import { parsePosixTz, ruleInstantUtcMillis, type PosixTz } from './posix-tz';
import { parseTzif, type TzifData, type TzifType } from './tzif-parse';
import { readZoneFile, resolveZoneinfoRoot } from './zoneinfo-source';
import type { OffsetInfo, TzBackend, ZoneTransition } from './types';

/** Options for {@link createTzifBackend}. */
export interface TzifBackendOptions {
  /**
   * Zoneinfo root directory. Defaults to /usr/share/zoneinfo when
   * present, else the tzdata vendored with this package.
   */
  zoneinfoRoot?: string;
}

/** The TZif backend: a {@link TzBackend} plus its resolved root. */
export interface TzifBackend extends TzBackend {
  /** Absolute path of the zoneinfo root actually in use. */
  readonly zoneinfoRoot: string;
}

interface ZoneRecord {
  data: TzifData;
  posix: PosixTz | null;
}

interface FooterEvent {
  instant: number;
  toDst: boolean;
}

function typeInfo(type: TzifType): OffsetInfo {
  return {
    offsetSeconds: type.offsetSeconds,
    abbreviation: type.abbreviation,
    isDst: type.isDst,
  };
}

/** Index of the last transition at or before t, or -1. */
function lastTransitionIndex(transitions: number[], t: number): number {
  let lo = 0;
  let hi = transitions.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((transitions[mid] ?? Infinity) <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function utcYearOf(millis: number): number {
  return civilFromDays(Math.floor(millis / DAY_MILLIS)).year;
}

/**
 * DST start and end instants derived from the footer for the years
 * [fromYear, toYear], sorted ascending.
 */
function footerEvents(posix: PosixTz, fromYear: number, toYear: number): FooterEvent[] {
  if (
    posix.dstStart === null ||
    posix.dstEnd === null ||
    posix.dstOffsetSeconds === null
  ) {
    return [];
  }
  const events: FooterEvent[] = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    events.push({
      instant: ruleInstantUtcMillis(posix.dstStart, year, posix.stdOffsetSeconds),
      toDst: true,
    });
    events.push({
      instant: ruleInstantUtcMillis(posix.dstEnd, year, posix.dstOffsetSeconds),
      toDst: false,
    });
  }
  return events.sort((a, b) => a.instant - b.instant);
}

function footerOffsetInfo(posix: PosixTz, t: number): OffsetInfo {
  const std: OffsetInfo = {
    offsetSeconds: posix.stdOffsetSeconds,
    abbreviation: posix.stdAbbreviation,
    isDst: false,
  };
  if (posix.dstAbbreviation === null || posix.dstOffsetSeconds === null) {
    return std;
  }
  const dst: OffsetInfo = {
    offsetSeconds: posix.dstOffsetSeconds,
    abbreviation: posix.dstAbbreviation,
    isDst: true,
  };
  const year = utcYearOf(t);
  const events = footerEvents(posix, year - 1, year + 1);
  let inDst: boolean | null = null;
  for (const event of events) {
    if (event.instant <= t) {
      inDst = event.toDst;
    }
  }
  if (inDst === null) {
    const first = events[0];
    inDst = first === undefined ? false : !first.toDst;
  }
  return inDst ? dst : std;
}

/**
 * Creates the TZif-file backend. Zone files are parsed once and
 * cached for the lifetime of the backend.
 */
export function createTzifBackend(options: TzifBackendOptions = {}): TzifBackend {
  const root = resolveZoneinfoRoot(options.zoneinfoRoot);
  const cache = new Map<string, ZoneRecord>();

  const load = (zone: string): ZoneRecord => {
    const cached = cache.get(zone);
    if (cached !== undefined) {
      return cached;
    }
    const data = parseTzif(readZoneFile(root, zone));
    const posix = data.posixTzString === null ? null : parsePosixTz(data.posixTzString);
    const record: ZoneRecord = { data, posix };
    cache.set(zone, record);
    return record;
  };

  const typeAtIndex = (data: TzifData, transitionIndex: number): TzifType => {
    const typeIndex =
      transitionIndex === -1
        ? data.firstTypeIndex
        : (data.transitionTypes[transitionIndex] ?? data.firstTypeIndex);
    const type = data.types[typeIndex];
    if (type === undefined) {
      throw new Error(`TZif type index ${typeIndex} out of range`);
    }
    return type;
  };

  const offsetAt = (instantUtcMillis: number, zone: string): OffsetInfo => {
    const { data, posix } = load(zone);
    const last = data.transitionMillis[data.transitionMillis.length - 1];
    const pastTable = last === undefined || instantUtcMillis >= last;
    if (pastTable && posix !== null) {
      return footerOffsetInfo(posix, instantUtcMillis);
    }
    const index = lastTransitionIndex(data.transitionMillis, instantUtcMillis);
    return typeInfo(typeAtIndex(data, index));
  };

  const transitionsBetween = (
    startUtcMillis: number,
    endUtcMillis: number,
    zone: string,
  ): ZoneTransition[] => {
    const { data, posix } = load(zone);
    const out: ZoneTransition[] = [];
    for (let i = 0; i < data.transitionMillis.length; i += 1) {
      const instant = data.transitionMillis[i];
      if (instant === undefined || instant < startUtcMillis) {
        continue;
      }
      if (instant >= endUtcMillis) {
        break;
      }
      const before = typeAtIndex(data, i - 1).offsetSeconds;
      const after = typeAtIndex(data, i).offsetSeconds;
      if (before !== after) {
        out.push({
          instant,
          offsetBeforeSeconds: before,
          offsetAfterSeconds: after,
          deltaSeconds: after - before,
        });
      }
    }
    const last = data.transitionMillis[data.transitionMillis.length - 1] ?? -Infinity;
    if (posix !== null && endUtcMillis > last) {
      const fromYear = utcYearOf(Math.max(startUtcMillis, last)) - 1;
      const toYear = utcYearOf(endUtcMillis) + 1;
      const dstOffset = posix.dstOffsetSeconds ?? posix.stdOffsetSeconds;
      for (const event of footerEvents(posix, fromYear, toYear)) {
        if (
          event.instant <= last ||
          event.instant < startUtcMillis ||
          event.instant >= endUtcMillis
        ) {
          continue;
        }
        const before = event.toDst ? posix.stdOffsetSeconds : dstOffset;
        const after = event.toDst ? dstOffset : posix.stdOffsetSeconds;
        if (before !== after) {
          out.push({
            instant: event.instant,
            offsetBeforeSeconds: before,
            offsetAfterSeconds: after,
            deltaSeconds: after - before,
          });
        }
      }
    }
    return out;
  };

  return {
    name: 'tzif',
    zoneinfoRoot: root,
    offsetAt,
    transitionsBetween,
  };
}
