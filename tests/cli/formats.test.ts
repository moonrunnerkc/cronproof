import { describe, expect, test } from 'vitest';
import type { Format } from '../../src/cli/index';
import { BERLIN_FALLBACK, invoke } from './helper';

const FORMATS: Format[] = ['human', 'json', 'sarif', 'junit', 'markdown'];

describe('all five formats emit output for every command', () => {
  test.each(FORMATS)('check emits non-empty %s with a receipt', (format) => {
    const { stdout } = invoke([...BERLIN_FALLBACK, '--format', format]);
    expect(stdout.length).toBeGreaterThan(0);
    if (format === 'json' || format === 'sarif') {
      expect(() => JSON.parse(stdout)).not.toThrow();
    }
    if (format === 'junit') {
      expect(stdout).toContain('<testsuites');
      expect(stdout).toContain('cronproof 9.9.9-test');
    }
    if (format === 'markdown') {
      expect(stdout.startsWith('# ')).toBe(true);
    }
    if (format === 'human') {
      expect(stdout).toContain('receipt');
    }
    if (format === 'json') {
      const parsed = JSON.parse(stdout) as { receipt: unknown; hazards: unknown[] };
      expect(parsed.receipt).toBeDefined();
      expect(Array.isArray(parsed.hazards)).toBe(true);
    }
  });

  test('explain produces valid json for a fold transition', () => {
    const { stdout, exit } = invoke([
      'explain', '30 2 * * *', '--tz', 'Europe/Berlin', '--at', '2023-10-29T01:00:00Z', '--format', 'json',
    ]);
    expect(exit).toBe(0);
    const parsed = JSON.parse(stdout) as { command: string; data: { transition: { deltaSeconds: number } } };
    expect(parsed.command).toBe('explain');
    expect(parsed.data.transition.deltaSeconds).toBe(-3600);
  });

  test('zones produces valid json listing affected zones', () => {
    const { stdout, exit } = invoke(['zones', '--hazard-window', '2023-03-25..2023-03-27', '--format', 'json']);
    expect(exit).toBe(0);
    const parsed = JSON.parse(stdout) as { command: string; data: { zoneCount: number; zones: { zone: string }[] } };
    expect(parsed.command).toBe('zones');
    expect(parsed.data.zoneCount).toBeGreaterThan(0);
    expect(parsed.data.zones.some((z) => z.zone === 'Europe/Berlin')).toBe(true);
  });

  test('scan is recognized and emits a valid, empty result', () => {
    const { stdout, exit } = invoke(['scan', './crontab', '--format', 'json']);
    expect(exit).toBe(0);
    const parsed = JSON.parse(stdout) as { command: string; hazards: unknown[] };
    expect(parsed.command).toBe('scan');
    expect(parsed.hazards).toEqual([]);
  });
});
