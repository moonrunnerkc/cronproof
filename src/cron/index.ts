/**
 * Public surface of the dialect-aware cron parser and enumerator.
 * Parsing normalizes seven dialects into one AST; enumeration turns
 * an AST plus a wall-clock window into ordered local firing tuples,
 * with no timezone involvement.
 */

export type {
  CronAst,
  CronError,
  DayOfMonthFieldAst,
  DayOfWeekFieldAst,
  DialectId,
  Domain,
  DomSpecial,
  DowSpecial,
  LocalFiring,
  NumericFieldAst,
  ParseResult,
} from './types';
export { parse, validate, dialectValidators } from './parse';
export type { DialectValidator } from './parse';
export { enumerate } from './enumerate';
export type { EnumerateParams, WallClock } from './enumerate';
export { dialectSpec, acceptedFieldCounts } from './dialects';
export type { DialectSpec, YearPresence } from './dialects';
