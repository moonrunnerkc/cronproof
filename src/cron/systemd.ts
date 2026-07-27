/**
 * Parser for a documented subset of the systemd OnCalendar grammar
 * (systemd.time(7), fetched 2026-07-27). OnCalendar is a distinct
 * grammar from field-based cron, so it gets its own parser that
 * produces the same AST shape where the two overlap and rejects, with
 * a located reason, any construct that does not map. The supported
 * subset and what it rejects are recorded in DECISIONS.md.
 *
 * Form: "[weekdays] [date] [time]" where date is Year-Month-Day (year
 * optional) and time is Hour:Minute[:Second]. Components accept "*",
 * integers, ".." ranges, "," lists, and "/" steps; the day may use
 * "~" to count from the end of the month.
 */

import { expandItem, splitItems } from './field-numeric';
import { weekdayFromName } from './names';
import type {
  CronError,
  DayOfMonthFieldAst,
  DayOfWeekFieldAst,
  Domain,
  NumericFieldAst,
  ParseResult,
} from './types';

const KEYWORDS: Record<string, string> = {
  minutely: '*-*-* *:*:00',
  hourly: '*-*-* *:00:00',
  daily: '*-*-* 00:00:00',
  monthly: '*-*-01 00:00:00',
  weekly: 'Mon *-*-* 00:00:00',
  yearly: '*-01-01 00:00:00',
  annually: '*-01-01 00:00:00',
  quarterly: '*-01,04,07,10-01 00:00:00',
};

function numeric(raw: string, offset: number, values: number[], wildcard: boolean): NumericFieldAst {
  return { raw, offset, startsWithAsterisk: raw.startsWith('*'), wildcard, values };
}

function fullField(domain: Domain, offset: number): NumericFieldAst {
  const values: number[] = [];
  for (let v = domain.min; v <= domain.max; v += 1) {
    values.push(v);
  }
  return numeric('*', offset, values, true);
}

function parseComponent(
  raw: string,
  offset: number,
  domain: Domain,
  fieldName: string,
  errors: CronError[],
): NumericFieldAst {
  const translated = raw.replace(/\.\./g, '-');
  const matched = new Set<number>();
  let wildcard = false;
  for (const item of splitItems(translated, offset)) {
    const result = expandItem(item, domain, () => null, fieldName);
    if (!result.ok) {
      errors.push({ offset: result.offset, field: fieldName, reason: result.reason });
    } else {
      wildcard = wildcard || result.wildcard;
      for (const value of result.values) {
        matched.add(value);
      }
    }
  }
  return numeric(raw, offset, [...matched].sort((a, b) => a - b), wildcard && raw === '*');
}

function parseDay(raw: string, offset: number, errors: CronError[]): DayOfMonthFieldAst {
  const days = new Set<number>();
  const special: DayOfMonthFieldAst['special'] = [];
  let wildcard = false;
  for (const item of splitItems(raw.replace(/\.\./g, '-'), offset)) {
    const t = item.text;
    if (t.startsWith('~')) {
      const rest = t.slice(1);
      if (rest !== '' && !/^\d+$/.test(rest)) {
        errors.push({ offset: item.offset, field: 'day-of-month', reason: `systemd day "${t}" must be ~ or ~N` });
      } else {
        special.push({ kind: 'last-day', offsetBack: rest === '' ? 0 : Number(rest) - 1 });
      }
    } else {
      const result = expandItem(item, { min: 1, max: 31 }, () => null, 'day-of-month');
      if (!result.ok) {
        errors.push({ offset: result.offset, field: 'day-of-month', reason: result.reason });
      } else {
        wildcard = wildcard || result.wildcard;
        for (const value of result.values) {
          days.add(value);
        }
      }
    }
  }
  return {
    raw,
    offset,
    startsWithAsterisk: raw.startsWith('*'),
    wildcard: wildcard && raw === '*',
    questionMark: false,
    days: [...days].sort((a, b) => a - b),
    special,
  };
}

function parseWeekdays(raw: string, offset: number, errors: CronError[]): DayOfWeekFieldAst {
  const weekdays = new Set<number>();
  for (const item of splitItems(raw, offset)) {
    const t = item.text;
    const range = t.split('..');
    if (range.length === 2) {
      const a = weekdayFromName(range[0] ?? '');
      const b = weekdayFromName(range[1] ?? '');
      if (a === null || b === null) {
        errors.push({ offset: item.offset, field: 'day-of-week', reason: `systemd weekday range "${t}" is not two weekday names` });
        continue;
      }
      for (let step = 0; step < 7; step += 1) {
        const wd = (a + step) % 7;
        weekdays.add(wd);
        if (wd === b) {
          break;
        }
      }
    } else {
      const wd = weekdayFromName(t);
      if (wd === null) {
        errors.push({ offset: item.offset, field: 'day-of-week', reason: `systemd weekday "${t}" is not a known weekday name` });
      } else {
        weekdays.add(wd);
      }
    }
  }
  return {
    raw,
    offset,
    startsWithAsterisk: false,
    wildcard: false,
    questionMark: false,
    weekdays: [...weekdays].sort((a, b) => a - b),
    special: [],
  };
}

interface Parts {
  weekday: { text: string; offset: number } | null;
  date: { text: string; offset: number } | null;
  time: { text: string; offset: number } | null;
}

function classify(source: string, errors: CronError[]): Parts | null {
  const parts: Parts = { weekday: null, date: null, time: null };
  const pattern = /\S+/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const tok = { text: match[0], offset: match.index };
    if (tok.text.includes(':')) {
      parts.time = tok;
    } else if (/[A-Za-z]/.test(tok.text)) {
      parts.weekday = tok;
    } else if (tok.text.includes('-') || tok.text.includes('~')) {
      parts.date = tok;
    } else {
      errors.push({ offset: tok.offset, field: 'expression', reason: `systemd cannot classify "${tok.text}" as weekday, date, or time` });
      return null;
    }
    match = pattern.exec(source);
  }
  return parts;
}

function parseDate(
  part: { text: string; offset: number },
  errors: CronError[],
): { month: NumericFieldAst; day: DayOfMonthFieldAst; year: NumericFieldAst | null } {
  const tilde = part.text.indexOf('~');
  let dayText = '';
  let head = part.text;
  if (tilde !== -1) {
    dayText = part.text.slice(tilde);
    head = part.text.slice(0, tilde).replace(/-$/, '');
  }
  const segs = head.split('-');
  const dateOffset = part.offset;
  let yearSeg: string | null = null;
  let monthSeg: string;
  let daySeg: string;
  if (tilde !== -1) {
    if (segs.length === 2) {
      yearSeg = segs[0] ?? null;
      monthSeg = segs[1] ?? '';
    } else {
      monthSeg = segs[0] ?? '';
    }
    daySeg = dayText;
  } else if (segs.length === 3) {
    yearSeg = segs[0] ?? null;
    monthSeg = segs[1] ?? '';
    daySeg = segs[2] ?? '';
  } else if (segs.length === 2) {
    monthSeg = segs[0] ?? '';
    daySeg = segs[1] ?? '';
  } else {
    errors.push({ offset: dateOffset, field: 'expression', reason: `systemd date "${part.text}" must be Year-Month-Day or Month-Day` });
    return { month: fullField({ min: 1, max: 12 }, dateOffset), day: parseDay('*', dateOffset, errors), year: null };
  }
  const month = parseComponent(monthSeg, dateOffset, { min: 1, max: 12 }, 'month', errors);
  const day = parseDay(daySeg, dateOffset, errors);
  const year =
    yearSeg === null || yearSeg === '*'
      ? null
      : parseComponent(yearSeg, dateOffset, { min: 1970, max: 2099 }, 'year', errors);
  return { month, day, year };
}

/** Parses a systemd OnCalendar expression into the shared AST or errors. */
export function parseOnCalendar(source: string): ParseResult {
  const trimmed = source.trim();
  const keyword = KEYWORDS[trimmed.toLowerCase()];
  const effective = keyword ?? source;
  if (effective.trim().length === 0) {
    return { ok: false, errors: [{ offset: 0, field: 'expression', reason: 'OnCalendar expression is empty' }] };
  }
  const errors: CronError[] = [];
  const parts = classify(effective, errors);
  if (parts === null) {
    return { ok: false, errors };
  }

  const time = parts.time;
  const second = time === null ? numeric('0', 0, [0], false) : parseComponent(time.text.split(':')[2] ?? '0', time.offset, { min: 0, max: 59 }, 'second', errors);
  const minuteText = time === null ? '0' : time.text.split(':')[1] ?? '';
  const hourText = time === null ? '0' : time.text.split(':')[0] ?? '';
  const minute = parseComponent(minuteText, time?.offset ?? 0, { min: 0, max: 59 }, 'minute', errors);
  const hour = parseComponent(hourText, time?.offset ?? 0, { min: 0, max: 23 }, 'hour', errors);

  const dateParsed =
    parts.date === null
      ? { month: fullField({ min: 1, max: 12 }, 0), day: parseDay('*', 0, errors), year: null }
      : parseDate(parts.date, errors);

  const dayOfWeek =
    parts.weekday === null
      ? { raw: '*', offset: 0, startsWithAsterisk: true, wildcard: true, questionMark: false, weekdays: [0, 1, 2, 3, 4, 5, 6], special: [] }
      : parseWeekdays(parts.weekday.text, parts.weekday.offset, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    ast: {
      dialect: 'systemd',
      source,
      second,
      minute,
      hour,
      dayOfMonth: dateParsed.day,
      month: dateParsed.month,
      dayOfWeek,
      year: dateParsed.year,
      hasSecondsField: true,
      reboot: false,
    },
  };
}
