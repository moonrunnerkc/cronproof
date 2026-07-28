/**
 * CLI entry glue. Reads this package's version (the package.json path
 * is robust for both the source and bundled layouts because this file
 * sits one level above package.json in each), then hands off to the
 * dispatcher in src/cli.
 */

import { readFile } from 'node:fs/promises';
import { dispatchCli } from './cli/index';

/** Options the host passes to the CLI. */
export interface CliOptions {
  /** Arguments after the node binary and the script path. */
  argv: string[];
  /** Raw stdout writer. */
  writeOut: (text: string) => void;
  /** Raw stderr writer. */
  writeError: (text: string) => void;
  /** Whether stdout is a TTY. */
  isTty: boolean;
}

/**
 * Reads this package's version from the package.json that ships next
 * to the compiled (or source) module.
 */
export async function readOwnVersion(): Promise<string> {
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const raw = await readFile(packageJsonUrl, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('package.json has no string "version" field');
  }
  return parsed.version;
}

/** Runs the CLI: reads the version, then dispatches, returning the exit code. */
export async function runCli(options: CliOptions): Promise<number> {
  const version = await readOwnVersion();
  return dispatchCli({ ...options, version });
}
