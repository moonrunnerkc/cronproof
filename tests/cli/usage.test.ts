import { describe, expect, test } from 'vitest';
import { invoke } from './helper';

/**
 * Every command the dispatcher accepts. A user who runs cronproof with no
 * arguments has to be able to discover all of them, and a user reading
 * --help has to be able to reach each one without guessing.
 */
const COMMANDS = ['check', 'scan', 'explain', 'zones', 'baseline'];

describe('the CLI tells a user every command it accepts', () => {
  test('running with no command names all five commands, not a subset', () => {
    const { stderr, exit } = invoke([]);
    expect(exit).toBe(0);
    const { stderr: missing, exit: missingExit } = invoke(['--tzdb-check', '2025b']);
    expect(missingExit).toBe(2);
    expect(missing).toContain('missing command');
    for (const command of COMMANDS) {
      expect(missing).toContain(command);
    }
    expect(stderr).toBe('');
  });

  test('--help lists every command and every documented option', () => {
    const { stdout, exit } = invoke(['--help']);
    expect(exit).toBe(0);
    for (const command of COMMANDS) {
      expect(stdout).toContain(command);
    }
    for (const option of [
      '--format',
      '--dialect',
      '--fail-on',
      '--idempotent',
      '--baseline',
      '--tzdb-check',
      '--zoneinfo-root',
      '--help',
      '--version',
    ]) {
      expect(stdout).toContain(option);
    }
  });

  test('--version prints the version the host supplied', () => {
    const { stdout, exit } = invoke(['--version']);
    expect(exit).toBe(0);
    expect(stdout.trim()).toBe('cronproof 9.9.9-test');
  });
});
