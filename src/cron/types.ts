/**
 * Normalized cron AST and shared cron types. The AST is produced by
 * every dialect parser and consumed by the enumerator. It preserves
 * the source-level detail that later phases key off, specifically
 * whether the minute and hour fields literally begin with an
 * asterisk (Debian cron's DST branch keys off that textual property,
 * not the semantic field value).
 *
 * Day-of-week is canonicalized to 0 through 6 with 0 as Sunday
 * regardless of the dialect's own numbering, so downstream code never
 * has to know which dialect produced the AST.
 */

/** Identifier of a supported cron dialect. */
export type DialectId =
  | 'vixie'
  | 'debian'
  | 'quartz'
  | 'k8s'
  | 'systemd'
  | 'github-actions'
  | 'aws-eventbridge';

/** A parse or validation error tied to a source location. */
export interface CronError {
  /** Zero-based character offset into the source expression. */
  offset: number;
  /** Field name the error belongs to, or "expression" for whole-input errors. */
  field: string;
  /** What failed and, where useful, what to do about it. */
  reason: string;
}

/** Inclusive integer domain for a field. */
export interface Domain {
  /** Smallest legal value. */
  min: number;
  /** Largest legal value. */
  max: number;
}

/**
 * A numeric field (second, minute, hour, month, year) reduced to the
 * sorted set of values it matches, with the source detail that
 * normalization must not lose.
 */
export interface NumericFieldAst {
  /** Verbatim source text of this field. */
  raw: string;
  /** Character offset of the field's first character in the source. */
  offset: number;
  /** True when the field's source literally begins with "*". */
  startsWithAsterisk: boolean;
  /** True when the field is exactly "*" (matches every value). */
  wildcard: boolean;
  /** Sorted, de-duplicated matching values within the field domain. */
  values: number[];
}

/** A day-of-month matcher that can only be resolved against a real month. */
export type DomSpecial =
  | { kind: 'last-day'; offsetBack: number }
  | { kind: 'last-weekday' }
  | { kind: 'nearest-weekday'; day: number };

/** A day-of-week matcher that can only be resolved against a real month. */
export type DowSpecial =
  | { kind: 'nth'; weekday: number; nth: number }
  | { kind: 'last'; weekday: number };

/** The day-of-month field: plain days plus month-dependent matchers. */
export interface DayOfMonthFieldAst {
  /** Verbatim source text of this field. */
  raw: string;
  /** Character offset of the field's first character in the source. */
  offset: number;
  /** True when the field's source literally begins with "*". */
  startsWithAsterisk: boolean;
  /** True when the field is exactly "*". */
  wildcard: boolean;
  /** True when the field is "?" (unrestricted, Quartz and AWS). */
  questionMark: boolean;
  /** Sorted, de-duplicated plain day matches, 1 through 31. */
  days: number[];
  /** Month-dependent matchers (L, LW, nW). */
  special: DomSpecial[];
}

/** The day-of-week field: plain weekdays plus month-dependent matchers. */
export interface DayOfWeekFieldAst {
  /** Verbatim source text of this field. */
  raw: string;
  /** Character offset of the field's first character in the source. */
  offset: number;
  /** True when the field's source literally begins with "*". */
  startsWithAsterisk: boolean;
  /** True when the field is exactly "*". */
  wildcard: boolean;
  /** True when the field is "?" (unrestricted, Quartz and AWS). */
  questionMark: boolean;
  /** Sorted canonical weekdays, 0 through 6 with 0 as Sunday. */
  weekdays: number[];
  /** Month-dependent matchers (n#m nth weekday, nL last weekday). */
  special: DowSpecial[];
}

/** A fully parsed, dialect-normalized cron schedule. */
export interface CronAst {
  /** Dialect this AST was parsed under. */
  dialect: DialectId;
  /** Verbatim source expression. */
  source: string;
  /** Seconds field; defaults to the single value 0 when the dialect has none. */
  second: NumericFieldAst;
  /** Minutes field. */
  minute: NumericFieldAst;
  /** Hours field. */
  hour: NumericFieldAst;
  /** Day-of-month field. */
  dayOfMonth: DayOfMonthFieldAst;
  /** Month field. */
  month: NumericFieldAst;
  /** Day-of-week field. */
  dayOfWeek: DayOfWeekFieldAst;
  /** Year field, present only for dialects that carry one; else null. */
  year: NumericFieldAst | null;
  /** True when the dialect supplied an explicit seconds field in source. */
  hasSecondsField: boolean;
  /** True for @reboot and equivalents: no wall-clock schedule exists. */
  reboot: boolean;
}

/** Result of parsing: either an AST or a non-empty list of errors. */
export type ParseResult =
  | { ok: true; ast: CronAst }
  | { ok: false; errors: CronError[] };

/** A single intended wall-clock firing, before any timezone resolution. */
export interface LocalFiring {
  /** Calendar year. */
  year: number;
  /** Month, 1 through 12. */
  month: number;
  /** Day of month, 1 through 31. */
  day: number;
  /** Hour, 0 through 23. */
  hour: number;
  /** Minute, 0 through 59. */
  minute: number;
  /** Second, 0 through 59. */
  second: number;
}
