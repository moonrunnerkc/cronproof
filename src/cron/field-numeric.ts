/**
 * Low-level parsing of a comma-separated numeric cron field into the
 * set of integers it matches, with character offsets preserved for
 * error reporting. Shared by every dialect and by the day-of-month
 * and day-of-week parsers, which layer their special tokens on top.
 */

import type { CronError, Domain, NumericFieldAst } from './types';

/** One comma-separated item with its offset in the source. */
export interface FieldItem {
  /** Item text with no surrounding commas. */
  text: string;
  /** Character offset of the item's first character in the source. */
  offset: number;
}

/** Splits a raw field into comma-separated items, tracking offsets. */
export function splitItems(raw: string, offset: number): FieldItem[] {
  const items: FieldItem[] = [];
  let start = 0;
  for (let i = 0; i <= raw.length; i += 1) {
    if (i === raw.length || raw[i] === ',') {
      items.push({ text: raw.slice(start, i), offset: offset + start });
      start = i + 1;
    }
  }
  return items;
}

/** Resolves a numeric or named atom to an integer, or null if neither. */
export type ResolveName = (text: string) => number | null;

function resolveAtom(text: string, resolveName: ResolveName): number | null {
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  return resolveName(text);
}

/** Either the expanded integers of one item, or a located error. */
export type ItemResult =
  | { ok: true; values: number[]; wildcard: boolean }
  | { ok: false; offset: number; reason: string };

/**
 * Expands one comma-free item (a single value, a range, or either
 * with a step) into its matching integers within the domain. Named
 * values are resolved through resolveName. The item's offset is used
 * verbatim in any error so callers can point at the exact character.
 */
export function expandItem(
  item: FieldItem,
  domain: Domain,
  resolveName: ResolveName,
  fieldName: string,
): ItemResult {
  const err = (reason: string): ItemResult => ({ ok: false, offset: item.offset, reason });
  if (item.text.length === 0) {
    return err(`${fieldName} has an empty entry; remove the stray comma`);
  }
  const slashCount = item.text.split('/').length - 1;
  if (slashCount > 1) {
    return err(`${fieldName} entry "${item.text}" has more than one step operator`);
  }
  const [basePart, stepPart] = item.text.split('/');
  const base = basePart ?? '';
  let step = 1;
  if (stepPart !== undefined) {
    if (!/^\d+$/.test(stepPart) || Number(stepPart) === 0) {
      return err(`${fieldName} step "${stepPart}" must be a positive integer`);
    }
    step = Number(stepPart);
  }

  let lo: number;
  let hi: number;
  let wildcard = false;
  if (base === '*') {
    lo = domain.min;
    hi = domain.max;
    wildcard = stepPart === undefined;
  } else if (base.includes('-')) {
    const [aText, bText] = base.split('-');
    const a = resolveAtom(aText ?? '', resolveName);
    const b = resolveAtom(bText ?? '', resolveName);
    if (a === null || b === null) {
      return err(`${fieldName} range "${base}" is not a valid pair of values`);
    }
    lo = a;
    hi = b;
  } else {
    const v = resolveAtom(base, resolveName);
    if (v === null) {
      return err(`${fieldName} value "${base}" is not a number or known name`);
    }
    lo = v;
    hi = stepPart === undefined ? v : domain.max;
  }

  if (lo < domain.min || lo > domain.max || hi < domain.min || hi > domain.max) {
    return err(
      `${fieldName} value out of range: "${base}" is outside ${domain.min}-${domain.max}`,
    );
  }
  if (lo > hi) {
    return err(`${fieldName} range "${base}" runs backward; start must not exceed end`);
  }
  const values: number[] = [];
  for (let v = lo; v <= hi; v += step) {
    values.push(v);
  }
  return { ok: true, values, wildcard };
}

/**
 * Parses a complete numeric field (second, minute, hour, month, or
 * year) into a normalized AST node, collecting every located error
 * rather than stopping at the first.
 */
export function parseNumericField(
  raw: string,
  offset: number,
  domain: Domain,
  resolveName: ResolveName,
  fieldName: string,
): { field: NumericFieldAst } | { errors: CronError[] } {
  const errors: CronError[] = [];
  const matched = new Set<number>();
  let wildcard = false;
  for (const item of splitItems(raw, offset)) {
    const result = expandItem(item, domain, resolveName, fieldName);
    if (!result.ok) {
      errors.push({ offset: result.offset, field: fieldName, reason: result.reason });
      continue;
    }
    wildcard = wildcard || result.wildcard;
    for (const value of result.values) {
      matched.add(value);
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
      values: [...matched].sort((a, b) => a - b),
    },
  };
}
