/**
 * Shared types for the dual-backend timezone engine.
 *
 * Two independent backends (Intl and a TZif parser) implement
 * {@link TzBackend}; a cross-check compares them transition by
 * transition. Wall-clock resolution returns a three-way discriminated
 * union so a caller can never obtain an instant without handling
 * whether the local time was unique, nonexistent, or ambiguous.
 */

/** UTC offset information in effect at one instant in one zone. */
export interface OffsetInfo {
  /** Total UTC offset in seconds, positive east of Greenwich. */
  offsetSeconds: number;
  /** Zone designation, for example "EST", "IST", or "GMT+5:30". */
  abbreviation: string;
  /**
   * Daylight-saving flag exactly as reported by the backend's data
   * source. This is raw data, not a season indicator: under negative
   * DST (Europe/Dublin) the flag is set in winter. Nothing in this
   * codebase may use it as a proxy for summer or for offset math.
   */
  isDst: boolean;
}

/** One change of UTC offset in a zone. */
export interface ZoneTransition {
  /** Instant of the transition, UTC milliseconds since the epoch. */
  instant: number;
  /** Offset in seconds in effect immediately before the transition. */
  offsetBeforeSeconds: number;
  /** Offset in seconds in effect at and after the transition. */
  offsetAfterSeconds: number;
  /** offsetAfterSeconds minus offsetBeforeSeconds; never zero. */
  deltaSeconds: number;
}

/** Interface implemented identically by both timezone backends. */
export interface TzBackend {
  /** Backend identifier used in cross-check reports. */
  readonly name: string;
  /** Resolves the UTC offset in effect at an instant in a zone. */
  offsetAt(instantUtcMillis: number, zone: string): OffsetInfo;
  /**
   * Returns every offset-changing transition with an instant in
   * [startUtcMillis, endUtcMillis), ordered by instant ascending.
   * Transitions that change only the abbreviation or the DST flag
   * while keeping the same offset are not included.
   */
  transitionsBetween(
    startUtcMillis: number,
    endUtcMillis: number,
    zone: string,
  ): ZoneTransition[];
}

/** A local wall-clock reading, not yet anchored to any instant. */
export interface LocalWallFields {
  /** Calendar year, for example 2024. */
  year: number;
  /** Calendar month, 1 through 12. */
  month: number;
  /** Day of month, 1 through 31. */
  day: number;
  /** Hour of day, 0 through 23. */
  hour: number;
  /** Minute, 0 through 59. */
  minute: number;
  /** Second, 0 through 59; defaults to 0. */
  second?: number;
  /** Millisecond, 0 through 999; defaults to 0. */
  millisecond?: number;
}

/** The local time maps to exactly one instant. */
export interface UniqueResolution {
  /** Discriminant. */
  kind: 'unique';
  /** The single instant, UTC milliseconds. */
  instant: number;
  /** UTC offset in seconds in effect at that instant. */
  offsetSeconds: number;
}

/** The local time was skipped by a forward offset transition. */
export interface NonexistentResolution {
  /** Discriminant. */
  kind: 'nonexistent';
  /** Instant of the transition that created the gap, UTC millis. */
  transitionInstant: number;
  /**
   * First skipped wall-clock value, encoded as wall milliseconds:
   * the local fields interpreted as if they were UTC.
   */
  gapStartWallMillis: number;
  /** First wall-clock value after the gap, same wall encoding. */
  gapEndWallMillis: number;
  /** Length of the skipped wall-clock interval in milliseconds. */
  gapDurationMilliseconds: number;
}

/** The local time occurs more than once due to a backward transition. */
export interface AmbiguousResolution {
  /** Discriminant. */
  kind: 'ambiguous';
  /** All instants that display this local time, ascending. */
  candidateInstants: number[];
  /** The earliest candidate instant, UTC milliseconds. */
  earlierInstant: number;
  /** The latest candidate instant, UTC milliseconds. */
  laterInstant: number;
  /** Length of the repeated wall-clock interval in milliseconds. */
  foldDurationMilliseconds: number;
}

/**
 * Result of resolving a local wall-clock reading in a zone. Callers
 * must discriminate on `kind`; no branch exposes a bare instant
 * without identifying which of the three cases occurred.
 */
export type WallClockResolution =
  | UniqueResolution
  | NonexistentResolution
  | AmbiguousResolution;
