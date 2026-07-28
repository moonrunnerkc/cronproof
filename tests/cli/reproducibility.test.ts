import { describe, expect, test } from 'vitest';
import { BERLIN_FALLBACK, invoke } from './helper';

describe('reproducibility is the proof claim', () => {
  test('two json runs on identical inputs and tzdb are byte-for-byte identical', () => {
    const first = invoke([...BERLIN_FALLBACK, '--format', 'json']);
    const second = invoke([...BERLIN_FALLBACK, '--format', 'json']);
    const a = Buffer.from(first.stdout, 'utf8');
    const b = Buffer.from(second.stdout, 'utf8');
    expect(a.length).toBe(b.length);
    expect(a.equals(b)).toBe(true);
    expect(first.stdout).toBe(second.stdout);
  });

  test('the json receipt carries an input hash and a result hash', () => {
    const { stdout } = invoke([...BERLIN_FALLBACK, '--format', 'json']);
    const parsed = JSON.parse(stdout) as { receipt: { inputHash: string; resultHash: string; tzdbIntl: string; tzdbZoneinfo: string } };
    expect(parsed.receipt.inputHash).toMatch(/^sha256:[0-9a-f]{32}$/);
    expect(parsed.receipt.resultHash).toMatch(/^sha256:[0-9a-f]{32}$/);
    expect(parsed.receipt.tzdbIntl).toBe(parsed.receipt.tzdbZoneinfo);
  });

  test('a different expression changes the result hash', () => {
    const berlin = JSON.parse(invoke([...BERLIN_FALLBACK, '--format', 'json']).stdout) as { receipt: { resultHash: string } };
    const other = JSON.parse(
      invoke(['check', '30 1 * * *', '--tz', 'Europe/Berlin', '--from', '2023-10-28', '--to', '2023-10-30', '--format', 'json']).stdout,
    ) as { receipt: { resultHash: string } };
    expect(other.receipt.resultHash).not.toBe(berlin.receipt.resultHash);
  });
});
