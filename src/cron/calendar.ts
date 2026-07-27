/**
 * Proleptic Gregorian calendar math for cron enumeration, on plain
 * integers and nothing else. This deliberately duplicates the small
 * civil-date core that the timezone engine also uses: the enumerator
 * must be provably free of any timezone dependency (a test runs it
 * with the tz module mocked to throw), so it cannot import from
 * src/tz. See DECISIONS.md, phase 3, for the rationale.
 *
 * Epoch is 1970-01-01. Day numbers are days since the epoch and may
 * be negative before it.
 */

/** True when the year is a Gregorian leap year. */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const MONTH_LENGTHS = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Number of days in a given month (1 through 12) of a given year. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return MONTH_LENGTHS[month - 1] ?? 30;
}

/** Days since 1970-01-01 for a civil date; negative before the epoch. */
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
export function civilFromDays(days: number): { year: number; month: number; day: number } {
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

/** Day of week for a civil date; 0 is Sunday through 6 is Saturday. */
export function weekdayOf(year: number, month: number, day: number): number {
  const wd = (daysFromCivil(year, month, day) + 4) % 7;
  return wd < 0 ? wd + 7 : wd;
}

/**
 * Day-of-month of the last occurrence of a given weekday in a month,
 * for example the last Friday. Weekday is canonical, 0 as Sunday.
 */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const length = daysInMonth(year, month);
  const lastWd = weekdayOf(year, month, length);
  const back = (lastWd - weekday + 7) % 7;
  return length - back;
}

/**
 * Day-of-month of the last weekday (Monday through Friday) of a
 * month, used for the "LW" construct.
 */
export function lastBusinessDayOfMonth(year: number, month: number): number {
  const length = daysInMonth(year, month);
  const wd = weekdayOf(year, month, length);
  if (wd === 6) {
    return length - 1;
  }
  if (wd === 0) {
    return length - 2;
  }
  return length;
}

/**
 * Day-of-month of the weekday (Monday through Friday) nearest a
 * target day within the same month, used for the "nW" construct.
 * When the target falls on a weekend the search stays inside the
 * month, matching Quartz: a Saturday the 1st resolves to Monday the
 * 3rd rather than crossing into the previous month.
 */
export function nearestBusinessDay(year: number, month: number, target: number): number {
  const length = daysInMonth(year, month);
  const clamped = Math.min(Math.max(target, 1), length);
  const wd = weekdayOf(year, month, clamped);
  if (wd === 6) {
    return clamped === 1 ? clamped + 2 : clamped - 1;
  }
  if (wd === 0) {
    return clamped === length ? clamped - 2 : clamped + 1;
  }
  return clamped;
}
