import { dispatchCli } from '../../src/cli/index';

/** A fixed version so captured output is deterministic in tests. */
export const TEST_VERSION = '9.9.9-test';

/** Result of invoking the CLI in-process. */
export interface Invocation {
  stdout: string;
  stderr: string;
  exit: number;
}

/** Runs the CLI dispatcher in-process and captures its streams and exit code. */
export function invoke(argv: string[], isTty = false): Invocation {
  let stdout = '';
  let stderr = '';
  const exit = dispatchCli({
    argv,
    writeOut: (text) => {
      stdout += text;
    },
    writeError: (text) => {
      stderr += text;
    },
    isTty,
    version: TEST_VERSION,
  });
  return { stdout, stderr, exit };
}

/** The Europe/Berlin 2023 fall-back check, the canonical example. */
export const BERLIN_FALLBACK: string[] = [
  'check',
  '30 2 * * *',
  '--tz',
  'Europe/Berlin',
  '--from',
  '2023-10-28',
  '--to',
  '2023-10-30',
];
