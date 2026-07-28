/**
 * Public surface of the CLI: the dispatcher and its option and result
 * types, so the binary and tests share one entry point.
 */

export { dispatchCli } from './run';
export type { RunOptions } from './run';
export { parseArgs } from './args';
export type { ParsedArgs, ParseResult } from './args';
export { buildReceipt, receiptPairs, SUPPORTED_DIALECTS } from './receipt';
export { EXIT } from './types';
export type { Command, Format, HazardView, Receipt, ResultModel, Section } from './types';
