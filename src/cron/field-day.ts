/**
 * Parsers for the two day fields, which carry the dialect-specific
 * special tokens: day-of-month (L, LW, nW) and day-of-week (nL, n#m),
 * plus the "?" placeholder. Plain values reuse the numeric field
 * primitives; day-of-week values are canonicalized to 0 (Sunday)
 * through 6 (Saturday) regardless of the dialect's own numbering.
 */

import { expandItem, splitItems, type ResolveName } from './field-numeric';
import { weekdayFromName } from './names';
import type {
  CronError,
  DayOfMonthFieldAst,
  DayOfWeekFieldAst,
  DomSpecial,
  DowSpecial,
} from './types';

/** Which special tokens a dialect permits in the day-of-month field. */
export interface DomOptions {
  allowQuestionMark: boolean;
  allowL: boolean;
  allowW: boolean;
  dialectName: string;
}

/** Day-of-week numbering: Vixie (0 to 7, both 0 and 7 Sunday) or Quartz (1 to 7). */
export type DowNumbering = 'vixie' | 'quartz';

/** Which special tokens a dialect permits in the day-of-week field. */
export interface DowOptions {
  numbering: DowNumbering;
  allowQuestionMark: boolean;
  allowL: boolean;
  allowHash: boolean;
  dialectName: string;
}

const NO_NAMES: ResolveName = () => null;

function domDomain(): { min: number; max: number } {
  return { min: 1, max: 31 };
}

/** Parses the day-of-month field into its AST node. */
export function parseDayOfMonthField(
  raw: string,
  offset: number,
  opts: DomOptions,
): { field: DayOfMonthFieldAst } | { errors: CronError[] } {
  const errors: CronError[] = [];
  const days = new Set<number>();
  const special: DomSpecial[] = [];
  let questionMark = false;
  let wildcard = false;
  const items = splitItems(raw, offset);
  const push = (o: number, reason: string): void => {
    errors.push({ offset: o, field: 'day-of-month', reason });
  };

  for (const item of items) {
    const t = item.text;
    if (t === '?') {
      if (!opts.allowQuestionMark) {
        push(item.offset, `"?" is not supported in the ${opts.dialectName} day-of-month field`);
      } else if (items.length > 1) {
        push(item.offset, '"?" must be the only entry in the day-of-month field');
      } else {
        questionMark = true;
      }
    } else if (t === 'L' || t === 'LW' || /^L-\d+$/.test(t)) {
      if (!opts.allowL) {
        push(item.offset, `"L" is not supported in the ${opts.dialectName} day-of-month field`);
      } else if (t === 'LW') {
        if (!opts.allowW) {
          push(item.offset, `"LW" is not supported in the ${opts.dialectName} day-of-month field`);
        } else {
          special.push({ kind: 'last-weekday' });
        }
      } else {
        special.push({ kind: 'last-day', offsetBack: t === 'L' ? 0 : Number(t.slice(2)) });
      }
    } else if (/^\d+W$/.test(t)) {
      if (!opts.allowW) {
        push(item.offset, `"W" is not supported in the ${opts.dialectName} day-of-month field`);
      } else {
        const day = Number(t.slice(0, -1));
        if (day < 1 || day > 31) {
          push(item.offset, `day-of-month "${t}" targets a day outside 1-31`);
        } else {
          special.push({ kind: 'nearest-weekday', day });
        }
      }
    } else {
      const result = expandItem(item, domDomain(), NO_NAMES, 'day-of-month');
      if (!result.ok) {
        push(result.offset, result.reason);
      } else {
        wildcard = wildcard || result.wildcard;
        for (const value of result.values) {
          days.add(value);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }
  return {
    field: {
      raw,
      offset,
      startsWithAsterisk: raw.startsWith('*'),
      wildcard: wildcard && raw === '*',
      questionMark,
      days: [...days].sort((a, b) => a - b),
      special,
    },
  };
}

function dowResolveName(numbering: DowNumbering): ResolveName {
  return (text: string): number | null => {
    if (/^\d+$/.test(text)) {
      return Number(text);
    }
    const canonical = weekdayFromName(text);
    if (canonical === null) {
      return null;
    }
    return numbering === 'quartz' ? canonical + 1 : canonical;
  };
}

function toCanonical(numbering: DowNumbering, value: number): number {
  return numbering === 'quartz' ? value - 1 : value % 7;
}

function dowAtomCanonical(text: string, numbering: DowNumbering): number | null {
  const resolved = dowResolveName(numbering)(text);
  if (resolved === null) {
    return null;
  }
  const domain = numbering === 'quartz' ? { min: 1, max: 7 } : { min: 0, max: 7 };
  if (resolved < domain.min || resolved > domain.max) {
    return null;
  }
  return toCanonical(numbering, resolved);
}

/** Parses the day-of-week field into its AST node, canonicalized to 0 to 6. */
export function parseDayOfWeekField(
  raw: string,
  offset: number,
  opts: DowOptions,
): { field: DayOfWeekFieldAst } | { errors: CronError[] } {
  const errors: CronError[] = [];
  const weekdays = new Set<number>();
  const special: DowSpecial[] = [];
  let questionMark = false;
  let wildcard = false;
  const items = splitItems(raw, offset);
  const domain = opts.numbering === 'quartz' ? { min: 1, max: 7 } : { min: 0, max: 7 };
  const push = (o: number, reason: string): void => {
    errors.push({ offset: o, field: 'day-of-week', reason });
  };

  for (const item of items) {
    const t = item.text;
    if (t === '?') {
      if (!opts.allowQuestionMark) {
        push(item.offset, `"?" is not supported in the ${opts.dialectName} day-of-week field`);
      } else if (items.length > 1) {
        push(item.offset, '"?" must be the only entry in the day-of-week field');
      } else {
        questionMark = true;
      }
    } else if (t.includes('#')) {
      if (!opts.allowHash) {
        push(item.offset, `"#" is not supported in the ${opts.dialectName} day-of-week field`);
      } else {
        const [dayText, nthText] = t.split('#');
        const weekday = dowAtomCanonical(dayText ?? '', opts.numbering);
        const nth = Number(nthText);
        if (weekday === null || !/^\d+$/.test(nthText ?? '') || nth < 1 || nth > 5) {
          push(item.offset, `day-of-week "${t}" must be weekday#nth with nth from 1 to 5`);
        } else {
          special.push({ kind: 'nth', weekday, nth });
        }
      }
    } else if (t !== '*' && t.endsWith('L')) {
      if (!opts.allowL) {
        push(item.offset, `"L" is not supported in the ${opts.dialectName} day-of-week field`);
      } else if (t === 'L') {
        special.push({ kind: 'last', weekday: 6 });
      } else {
        const weekday = dowAtomCanonical(t.slice(0, -1), opts.numbering);
        if (weekday === null) {
          push(item.offset, `day-of-week "${t}" names an unknown weekday before "L"`);
        } else {
          special.push({ kind: 'last', weekday });
        }
      }
    } else {
      const result = expandItem(item, domain, dowResolveName(opts.numbering), 'day-of-week');
      if (!result.ok) {
        push(result.offset, result.reason);
      } else {
        wildcard = wildcard || result.wildcard;
        for (const value of result.values) {
          weekdays.add(toCanonical(opts.numbering, value));
        }
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }
  return {
    field: {
      raw,
      offset,
      startsWithAsterisk: raw.startsWith('*'),
      wildcard: wildcard && raw === '*',
      questionMark,
      weekdays: [...weekdays].sort((a, b) => a - b),
      special,
    },
  };
}
