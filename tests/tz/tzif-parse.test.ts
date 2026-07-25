import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseTzif, vendoredZoneinfoRoot } from '../../src/tz/index';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the vendoring step');
}

function readZone(zone: string): Uint8Array {
  return readFileSync(path.join(vendorRoot as string, zone));
}

describe('TZif binary parsing', () => {
  test('reads the 64-bit transition table and footer of America/New_York', () => {
    const data = parseTzif(readZone('America/New_York'));
    expect(['2', '3', '4']).toContain(data.version);
    expect(data.posixTzString).toBe('EST5EDT,M3.2.0,M11.1.0');
    expect(data.transitionMillis.length).toBeGreaterThan(100);
    expect(data.transitionMillis).toContain(Date.UTC(2024, 2, 10, 7, 0));
    const sorted = [...data.transitionMillis].sort((a, b) => a - b);
    expect(data.transitionMillis).toEqual(sorted);
    const abbreviations = new Set(data.types.map((t) => t.abbreviation));
    expect(abbreviations).toContain('EST');
    expect(abbreviations).toContain('EDT');
  });

  test('reads a constant zone with no transitions', () => {
    const data = parseTzif(readZone('Etc/UTC'));
    expect(data.transitionMillis).toEqual([]);
    expect(data.posixTzString).toBe('UTC0');
    expect(data.types[0]?.offsetSeconds).toBe(0);
  });

  test('preserves sub-minute historical offsets (Africa/Monrovia, UTC-00:44:30 until 1972)', () => {
    const data = parseTzif(readZone('Africa/Monrovia'));
    const offsets = data.types.map((t) => t.offsetSeconds);
    expect(offsets).toContain(-2670);
  });

  test('rejects input that is not TZif', () => {
    expect(() => parseTzif(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/magic/);
  });
});
