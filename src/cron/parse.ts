/**
 * Top-level cron parsing. Dispatches to the standard field-based
 * parser for six dialects and to the systemd OnCalendar grammar for
 * the seventh, and exposes per-dialect validate functions that return
 * structured errors with character offsets.
 */

import { dialectSpec, acceptedFieldCounts, type DialectSpec } from './dialects';
import { parseDayOfMonthField, parseDayOfWeekField } from './field-day';
import { parseNumericField } from './field-numeric';
import { resolveMacro } from './macros';
import { monthFromName } from './names';
import { parseOnCalendar } from './systemd';
import type {
  CronError,
  DialectId,
  Domain,
  NumericFieldAst,
  ParseResult,
} from './types';

interface Token {
  text: string;
  offset: number;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(source);
  while (match !== null) {
    tokens.push({ text: match[0], offset: match.index });
    match = pattern.exec(source);
  }
  return tokens;
}

function syntheticSeconds(offset: number): NumericFieldAst {
  return { raw: '0', offset, startsWithAsterisk: false, wildcard: false, values: [0] };
}

function yearDomain(spec: DialectSpec): Domain {
  return { min: 1970, max: spec.id === 'aws-eventbridge' ? 2199 : 2099 };
}

const MINUTE: Domain = { min: 0, max: 59 };
const HOUR: Domain = { min: 0, max: 23 };
const MONTH: Domain = { min: 1, max: 12 };

function collect(
  errors: CronError[],
  result: { field: NumericFieldAst } | { errors: CronError[] },
): NumericFieldAst | null {
  if ('errors' in result) {
    errors.push(...result.errors);
    return null;
  }
  return result.field;
}

function parseStandard(spec: DialectSpec, source: string): ParseResult {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return { ok: false, errors: [{ offset: 0, field: 'expression', reason: 'expression is empty' }] };
  }

  const first = tokens[0];
  if (first !== undefined && first.text.startsWith('@')) {
    return parseMacro(spec, source, tokens, first);
  }

  const counts = acceptedFieldCounts(spec);
  if (!counts.includes(tokens.length)) {
    return {
      ok: false,
      errors: [
        {
          offset: 0,
          field: 'expression',
          reason: `${spec.id} expects ${counts.join(' or ')} fields, got ${tokens.length}`,
        },
      ],
    };
  }

  const errors: CronError[] = [];
  let i = 0;
  const at = (): Token => tokens[i++] ?? { text: '', offset: source.length };
  const secondTok = spec.seconds ? at() : null;
  const minuteTok = at();
  const hourTok = at();
  const domTok = at();
  const monthTok = at();
  const dowTok = at();
  const yearTok = i < tokens.length ? at() : null;

  const second =
    secondTok === null
      ? syntheticSeconds(minuteTok.offset)
      : collect(errors, parseNumericField(secondTok.text, secondTok.offset, MINUTE, () => null, 'second'));
  const minute = collect(
    errors,
    parseNumericField(minuteTok.text, minuteTok.offset, MINUTE, () => null, 'minute'),
  );
  const hour = collect(
    errors,
    parseNumericField(hourTok.text, hourTok.offset, HOUR, () => null, 'hour'),
  );
  const dowResult = parseDayOfWeekField(dowTok.text, dowTok.offset, spec.dow);
  const domResult = parseDayOfMonthField(domTok.text, domTok.offset, spec.dom);
  const dom = 'errors' in domResult ? (errors.push(...domResult.errors), null) : domResult.field;
  const month = collect(
    errors,
    parseNumericField(monthTok.text, monthTok.offset, MONTH, monthFromName, 'month'),
  );
  const dayOfWeek = 'errors' in dowResult ? (errors.push(...dowResult.errors), null) : dowResult.field;
  const year =
    yearTok === null
      ? null
      : collect(errors, parseNumericField(yearTok.text, yearTok.offset, yearDomain(spec), () => null, 'year'));

  if (spec.requireQuestionMark && dom !== null && dayOfWeek !== null) {
    if (!dom.questionMark && !dayOfWeek.questionMark) {
      errors.push({
        offset: domTok.offset,
        field: 'day-of-month',
        reason: `${spec.id} requires "?" in day-of-month or day-of-week (you cannot restrict both)`,
      });
    }
  }

  if (errors.length > 0 || second === null || minute === null || hour === null || dom === null || month === null || dayOfWeek === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    ast: {
      dialect: spec.id,
      source,
      second,
      minute,
      hour,
      dayOfMonth: dom,
      month,
      dayOfWeek,
      year,
      hasSecondsField: spec.seconds,
      reboot: false,
    },
  };
}

function parseMacro(spec: DialectSpec, source: string, tokens: Token[], first: Token): ParseResult {
  if (!spec.allowMacros) {
    return {
      ok: false,
      errors: [{ offset: first.offset, field: 'expression', reason: `${spec.id} does not support @-macros` }],
    };
  }
  if (tokens.length > 1) {
    return {
      ok: false,
      errors: [{ offset: tokens[1]?.offset ?? first.offset, field: 'expression', reason: 'a macro must stand alone' }],
    };
  }
  const resolved = resolveMacro(first.text);
  if (resolved.kind === 'unknown') {
    return {
      ok: false,
      errors: [{ offset: first.offset, field: 'expression', reason: `unknown macro "${first.text}"` }],
    };
  }
  if (resolved.kind === 'reboot') {
    const expanded = parseStandard(spec, '0 0 1 1 *');
    if (!expanded.ok) {
      return expanded;
    }
    return { ok: true, ast: { ...expanded.ast, source, reboot: true } };
  }
  const expanded = parseStandard(spec, resolved.fields);
  if (!expanded.ok) {
    return expanded;
  }
  return { ok: true, ast: { ...expanded.ast, source } };
}

/** Parses a cron expression under a dialect into an AST or errors. */
export function parse(source: string, dialect: DialectId): ParseResult {
  if (dialect === 'systemd') {
    return parseOnCalendar(source);
  }
  const spec = dialectSpec(dialect);
  if (spec === null) {
    return { ok: false, errors: [{ offset: 0, field: 'expression', reason: `unknown dialect ${dialect}` }] };
  }
  return parseStandard(spec, source);
}

/** Validates a cron expression under a dialect, returning located errors. */
export function validate(source: string, dialect: DialectId): CronError[] {
  const result = parse(source, dialect);
  return result.ok ? [] : result.errors;
}

/** A dialect-scoped validator, one per supported dialect. */
export type DialectValidator = (source: string) => CronError[];

const DIALECT_IDS: DialectId[] = [
  'vixie',
  'debian',
  'quartz',
  'k8s',
  'systemd',
  'github-actions',
  'aws-eventbridge',
];

/** Per-dialect validate functions, so each dialect exposes its own. */
export const dialectValidators: Record<DialectId, DialectValidator> = Object.fromEntries(
  DIALECT_IDS.map((id) => [id, (source: string): CronError[] => validate(source, id)]),
) as Record<DialectId, DialectValidator>;
