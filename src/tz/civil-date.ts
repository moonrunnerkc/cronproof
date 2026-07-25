/**
 * Proleptic Gregorian calendar math on plain integers. Used to
 * convert local wall-clock fields to and from "wall milliseconds"
 * (the fields interpreted as if they were UTC) without going through
 * the host Date object, and to evaluate POSIX TZ day rules.
 *
 * The day-count algorithms are the standard branchless civil-date
 * conversions over an epoch of 1970-01-01.
 */

import type { LocalWallFields } from './types';

/** Milliseconds in one day. */
export const DAY_MILLIS = 86_400_000;

/** Returns true when the year is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Days in the given month (1 through 12) of the given year. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30;
}

/** Days since 1970-01-01 for a civil date; negative before 1970. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Civil date for a count of days since 1970-01-01. */
export function civilFromDays(days: number): {
  year: number;
  month: number;
  day: number;
} {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** Day of week for a day count since 1970-01-01; 0 is Sunday. */
export function weekdayFromDays(days: number): number {
  const wd = (days + 4) % 7;
  return wd < 0 ? wd + 7 : wd;
}

/**
 * Encodes local wall-clock fields as wall milliseconds: the value a
 * UTC clock would read at the same year, month, day, and time.
 */
export function wallMillisFromFields(fields: LocalWallFields): number {
  const days = daysFromCivil(fields.year, fields.month, fields.day);
  return (
    days * DAY_MILLIS +
    fields.hour * 3_600_000 +
    fields.minute * 60_000 +
    (fields.second ?? 0) * 1000 +
    (fields.millisecond ?? 0)
  );
}

/** Decodes wall milliseconds back into local wall-clock fields. */
export function fieldsFromWallMillis(wallMillis: number): Required<LocalWallFields> {
  const days = Math.floor(wallMillis / DAY_MILLIS);
  let rest = wallMillis - days * DAY_MILLIS;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(rest / 3_600_000);
  rest -= hour * 3_600_000;
  const minute = Math.floor(rest / 60_000);
  rest -= minute * 60_000;
  const second = Math.floor(rest / 1000);
  return { year, month, day, hour, minute, second, millisecond: rest - second * 1000 };
}
