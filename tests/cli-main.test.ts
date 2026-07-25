import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli-main';

async function packageJsonVersion(): Promise<string> {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

describe('cronproof CLI stub', () => {
  it('prints "cronproof <version>" using the version from package.json', async () => {
    const lines: string[] = [];
    await runCli({ writeLine: (line) => lines.push(line) });
    expect(lines).toEqual([`cronproof ${await packageJsonVersion()}`]);
  });

  it('reports exit code 0', async () => {
    const exitCode = await runCli({ writeLine: () => undefined });
    expect(exitCode).toBe(0);
  });
});
