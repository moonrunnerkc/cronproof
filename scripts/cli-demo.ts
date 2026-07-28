/**
 * Evidence for the CLI: the human-format output for the Europe/Berlin
 * fall-back case, and the double-run byte diff proving json is
 * reproducible. Runs the dispatcher in-process so it needs no build.
 * Schema validation of SARIF and JUnit is asserted in the test suite
 * (tests/cli/schema.test.ts), which appears in the evidence test run.
 */

import { dispatchCli } from '../src/cli/index';
import { readOwnVersion } from '../src/cli-main';

function capture(argv: string[], version: string): { stdout: string; exit: number } {
  let stdout = '';
  const exit = dispatchCli({
    argv,
    writeOut: (text) => {
      stdout += text;
    },
    writeError: (text) => {
      stdout += text;
    },
    isTty: false,
    version,
  });
  return { stdout, exit };
}

async function main(): Promise<number> {
  const version = await readOwnVersion();
  const check = ['check', '30 2 * * *', '--tz', 'Europe/Berlin', '--from', '2023-10-28', '--to', '2023-10-30'];

  process.stdout.write('== cronproof check, Europe/Berlin 2023 fall-back, human format ==\n\n');
  const human = capture(check, version);
  process.stdout.write(human.stdout);
  process.stdout.write(`\nexit code: ${human.exit}\n`);

  process.stdout.write('\n== json reproducibility: two runs on identical inputs and tzdb ==\n');
  const first = capture([...check, '--format', 'json'], version);
  const second = capture([...check, '--format', 'json'], version);
  const a = Buffer.from(first.stdout, 'utf8');
  const b = Buffer.from(second.stdout, 'utf8');
  let differing = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      differing += 1;
    }
  }
  process.stdout.write(`run 1: ${a.length} bytes\n`);
  process.stdout.write(`run 2: ${b.length} bytes\n`);
  process.stdout.write(`bytes differing: ${differing}\n`);
  process.stdout.write(`byte-identical: ${a.equals(b) ? 'yes' : 'no'}\n`);
  return a.equals(b) ? 0 : 1;
}

process.exitCode = await main();
