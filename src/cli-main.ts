import { readFile } from 'node:fs/promises';

/** Options controlling how the CLI writes its output. */
export interface CliOptions {
  /** Writer invoked once per line of standard output. */
  writeLine: (line: string) => void;
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

/**
 * Runs the phase 1 CLI stub: prints the package name and version,
 * then reports exit code 0. Argument handling arrives in a later
 * phase; every invocation currently prints the version.
 */
export async function runCli(options: CliOptions): Promise<number> {
  const version = await readOwnVersion();
  options.writeLine(`cronproof ${version}`);
  return 0;
}
