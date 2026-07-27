/**
 * The enumerator: given a parsed AST and a wall-clock window, it
 * produces the ordered intended firing times as local field tuples,
 * before any timezone resolution. This is pure calendar math. It
 * imports nothing from src/tz and never consults a zone to compute a
 * tuple; the zone is carried only so callers can hand the result to
 * the resolver in a later phase. Keeping enumeration and resolution
 * strictly separate is what makes timezone hazard detection possible.
 */

import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  lastBusinessDayOfMonth,
  lastWeekdayOfMonth,
  nearestBusinessDay,
  weekdayOf,
} from './calendar';
import { dialectSpec } from './dialects';
import type {
  CronAst,
  DayOfMonthFieldAst,
  DayOfWeekFieldAst,
  LocalFiring,
} from './types';

/** A wall-clock instant expressed as calendar fields. */
export type WallClock = LocalFiring;

/** Inputs to enumeration. The zone is metadata, never used for math. */
export interface EnumerateParams {
  /** IANA zone carried to the resolver; enumeration never reads it. */
  zone: string;
  /** Inclusive lower bound as naive wall-clock fields. */
  from: WallClock;
  /** Exclusive upper bound as naive wall-clock fields. */
  to: WallClock;
  /** Optional cap on the number of firings returned. */
  limit?: number;
}

function compare(a: WallClock, b: WallClock): number {
  return (
    a.year - b.year ||
    a.month - b.month ||
    a.day - b.day ||
    a.hour - b.hour ||
    a.minute - b.minute ||
    a.second - b.second
  );
}

function matchDayOfMonth(field: DayOfMonthFieldAst, year: number, month: number, day: number): boolean {
  if (field.wildcard || field.questionMark) {
    return true;
  }
  if (field.days.includes(day)) {
    return true;
  }
  for (const special of field.special) {
    if (special.kind === 'last-day' && day === daysInMonth(year, month) - special.offsetBack) {
      return true;
    }
    if (special.kind === 'last-weekday' && day === lastBusinessDayOfMonth(year, month)) {
      return true;
    }
    if (special.kind === 'nearest-weekday' && day === nearestBusinessDay(year, month, special.day)) {
      return true;
    }
  }
  return false;
}

function matchDayOfWeek(field: DayOfWeekFieldAst, year: number, month: number, day: number): boolean {
  if (field.wildcard || field.questionMark) {
    return true;
  }
  const weekday = weekdayOf(year, month, day);
  if (field.weekdays.includes(weekday)) {
    return true;
  }
  for (const special of field.special) {
    if (special.weekday !== weekday) {
      continue;
    }
    if (special.kind === 'nth' && Math.floor((day - 1) / 7) + 1 === special.nth) {
      return true;
    }
    if (special.kind === 'last' && day === lastWeekdayOfMonth(year, month, weekday)) {
      return true;
    }
  }
  return false;
}

function dayMatches(ast: CronAst, orQuirk: boolean, year: number, month: number, day: number): boolean {
  const domRestricted = !(ast.dayOfMonth.wildcard || ast.dayOfMonth.questionMark);
  const dowRestricted = !(ast.dayOfWeek.wildcard || ast.dayOfWeek.questionMark);
  const dm = matchDayOfMonth(ast.dayOfMonth, year, month, day);
  const wm = matchDayOfWeek(ast.dayOfWeek, year, month, day);
  if (orQuirk && domRestricted && dowRestricted) {
    return dm || wm;
  }
  return dm && wm;
}

/**
 * Enumerates the intended wall-clock firings of an AST within
 * [from, to). Output is strictly increasing in wall-clock order.
 * Returns an empty list for @reboot, for an empty or inverted
 * window, and when nothing in the window matches.
 */
export function enumerate(ast: CronAst, params: EnumerateParams): LocalFiring[] {
  const firings: LocalFiring[] = [];
  if (ast.reboot || compare(params.from, params.to) >= 0) {
    return firings;
  }
  const spec = dialectSpec(ast.dialect);
  const orQuirk = spec !== null && spec.orQuirk;
  const limit = params.limit ?? Number.POSITIVE_INFINITY;

  const startDay = daysFromCivil(params.from.year, params.from.month, params.from.day);
  const endDay = daysFromCivil(params.to.year, params.to.month, params.to.day);
  const months = new Set(ast.month.values);
  const years = ast.year === null ? null : new Set(ast.year.values);

  for (let dayNumber = startDay; dayNumber <= endDay; dayNumber += 1) {
    const date = civilFromDays(dayNumber);
    if (years !== null && !years.has(date.year)) {
      continue;
    }
    if (!months.has(date.month)) {
      continue;
    }
    if (!dayMatches(ast, orQuirk, date.year, date.month, date.day)) {
      continue;
    }
    for (const hour of ast.hour.values) {
      for (const minute of ast.minute.values) {
        for (const second of ast.second.values) {
          const firing: LocalFiring = {
            year: date.year,
            month: date.month,
            day: date.day,
            hour,
            minute,
            second,
          };
          if (compare(firing, params.from) < 0 || compare(firing, params.to) >= 0) {
            continue;
          }
          firings.push(firing);
          if (firings.length >= limit) {
            return firings;
          }
        }
      }
    }
  }
  return firings;
}
