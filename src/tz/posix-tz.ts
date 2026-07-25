/**
 * Parser and evaluator for POSIX TZ strings as they appear in TZif
 * footers (RFC 8536 section 3.3), including the version 3 extensions:
 * angle-bracket designations, offsets up to 167 hours, and negative
 * or oversized rule times such as Antarctica/Troll's "M3.5.0/1" pair
 * with a DST offset written as "-2".
 *
 * Sign convention: POSIX offsets are positive west of Greenwich, the
 * opposite of this codebase's east-positive offsetSeconds. Conversion
 * happens once, at parse time.
 */

import { daysFromCivil, daysInMonth, weekdayFromDays } from './civil-date';

/** A day-of-year rule for one endpoint of the DST period. */
export type PosixDayRule =
  | { form: 'month-week-day'; month: number; week: number; weekday: number }
  | { form: 'julian-no-leap'; day: number }
  | { form: 'julian-with-leap'; day: number };

/** One endpoint of the DST period: a day rule plus a local time. */
export interface PosixRule {
  /** Which calendar day the change happens on. */
  day: PosixDayRule;
  /** Seconds after local midnight; may be negative or exceed 24h. */
  timeSeconds: number;
}

/** A parsed POSIX TZ string. */
export interface PosixTz {
  /** Standard-time designation, for example "EST" or "+04". */
  stdAbbreviation: string;
  /** Standard-time UTC offset in seconds, east positive. */
  stdOffsetSeconds: number;
  /** DST designation, or null when the zone never observes DST. */
  dstAbbreviation: string | null;
  /** DST UTC offset in seconds, east positive; null without DST. */
  dstOffsetSeconds: number | null;
  /** Rule for entering DST; null without DST. */
  dstStart: PosixRule | null;
  /** Rule for leaving DST; null without DST. */
  dstEnd: PosixRule | null;
}

const NAME = /^(?:([A-Za-z]{3,})|<([A-Za-z0-9+-]{3,})>)/;
const OFFSET = /^([+-]?)(\d{1,3})(?::(\d{1,2})(?::(\d{1,2}))?)?/;
const RULE_DAY = /^(?:M(\d{1,2})\.(\d)\.(\d)|J(\d{1,3})|(\d{1,3}))/;

class Cursor {
  constructor(
    public text: string,
    public pos = 0,
  ) {}

  take(re: RegExp): RegExpExecArray | null {
    const match = re.exec(this.text.slice(this.pos));
    if (match !== null) {
      this.pos += match[0].length;
    }
    return match;
  }

  done(): boolean {
    return this.pos >= this.text.length;
  }
}

function parseOffsetSeconds(cursor: Cursor): number | null {
  const match = cursor.take(OFFSET);
  if (match === null) {
    return null;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const seconds =
    Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
  const eastPositive = -sign * seconds;
  return eastPositive === 0 ? 0 : eastPositive;
}

function parseRule(cursor: Cursor): PosixRule | null {
  const match = cursor.take(RULE_DAY);
  if (match === null) {
    return null;
  }
  let day: PosixDayRule;
  if (match[1] !== undefined) {
    day = {
      form: 'month-week-day',
      month: Number(match[1]),
      week: Number(match[2]),
      weekday: Number(match[3]),
    };
  } else if (match[4] !== undefined) {
    day = { form: 'julian-no-leap', day: Number(match[4]) };
  } else {
    day = { form: 'julian-with-leap', day: Number(match[5]) };
  }
  let timeSeconds = 7200;
  if (cursor.text[cursor.pos] === '/') {
    cursor.pos += 1;
    const time = cursor.take(OFFSET);
    if (time === null) {
      return null;
    }
    const sign = time[1] === '-' ? -1 : 1;
    const magnitude =
      Number(time[2]) * 3600 + Number(time[3] ?? 0) * 60 + Number(time[4] ?? 0);
    timeSeconds = magnitude === 0 ? 0 : sign * magnitude;
  }
  return { day, timeSeconds };
}

/**
 * Parses a POSIX TZ string. Returns null on any syntax error and on
 * the POSIX form that names a DST zone without transition rules,
 * which zic never emits in a TZif footer.
 */
export function parsePosixTz(text: string): PosixTz | null {
  const cursor = new Cursor(text);
  const stdName = cursor.take(NAME);
  if (stdName === null) {
    return null;
  }
  const stdOffsetSeconds = parseOffsetSeconds(cursor);
  if (stdOffsetSeconds === null) {
    return null;
  }
  const stdAbbreviation = stdName[1] ?? stdName[2] ?? '';
  if (cursor.done()) {
    return {
      stdAbbreviation,
      stdOffsetSeconds,
      dstAbbreviation: null,
      dstOffsetSeconds: null,
      dstStart: null,
      dstEnd: null,
    };
  }
  const dstName = cursor.take(NAME);
  if (dstName === null) {
    return null;
  }
  let dstOffsetSeconds = stdOffsetSeconds + 3600;
  if (cursor.text[cursor.pos] !== ',') {
    const parsed = parseOffsetSeconds(cursor);
    if (parsed === null) {
      return null;
    }
    dstOffsetSeconds = parsed;
  }
  if (cursor.text[cursor.pos] !== ',') {
    return null;
  }
  cursor.pos += 1;
  const dstStart = parseRule(cursor);
  if (dstStart === null || cursor.text[cursor.pos] !== ',') {
    return null;
  }
  cursor.pos += 1;
  const dstEnd = parseRule(cursor);
  if (dstEnd === null || !cursor.done()) {
    return null;
  }
  return {
    stdAbbreviation,
    stdOffsetSeconds,
    dstAbbreviation: dstName[1] ?? dstName[2] ?? '',
    dstOffsetSeconds,
    dstStart,
    dstEnd,
  };
}

function ruleDayFromEpoch(rule: PosixDayRule, year: number): number {
  if (rule.form === 'month-week-day') {
    const firstOfMonth = daysFromCivil(year, rule.month, 1);
    const firstWeekday = weekdayFromDays(firstOfMonth);
    let day = 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.week - 1) * 7;
    const limit = daysInMonth(year, rule.month);
    while (day > limit) {
      day -= 7;
    }
    return daysFromCivil(year, rule.month, day);
  }
  if (rule.form === 'julian-no-leap') {
    const leapAdjust = rule.day >= 60 && rule.day <= 365 && daysInMonth(year, 2) === 29 ? 1 : 0;
    return daysFromCivil(year, 1, 1) + rule.day - 1 + leapAdjust;
  }
  return daysFromCivil(year, 1, 1) + rule.day;
}

/**
 * UTC instant, in milliseconds, of one DST rule endpoint in a year.
 * The rule time is local; POSIX interprets the start rule in standard
 * time and the end rule in DST time, expressed here by the caller
 * passing the offset in effect just before the change.
 */
export function ruleInstantUtcMillis(
  rule: PosixRule,
  year: number,
  offsetBeforeSeconds: number,
): number {
  const days = ruleDayFromEpoch(rule.day, year);
  return (days * 86_400 + rule.timeSeconds - offsetBeforeSeconds) * 1000;
}
