import { describe, expect, test } from 'vitest';
import {
  createTzifBackend,
  resolveWallClock,
  vendoredZoneinfoRoot,
} from '../../src/tz/index';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the vendoring step');
}
const backend = createTzifBackend({ zoneinfoRoot: vendorRoot });

describe('resolveWallClock input handling', () => {
  test('an ordinary local time resolves to a unique instant with its offset', () => {
    const result = resolveWallClock(
      { year: 2024, month: 6, day: 15, hour: 12, minute: 0 },
      'America/New_York',
      backend,
    );
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.instant).toBe(Date.UTC(2024, 5, 15, 16, 0));
      expect(result.offsetSeconds).toBe(-14_400);
    }
  });

  test('rejects out-of-range calendar fields with RangeError', () => {
    expect(() =>
      resolveWallClock({ year: 2024, month: 13, day: 1, hour: 0, minute: 0 }, 'UTC', backend),
    ).toThrow(RangeError);
    expect(() =>
      resolveWallClock({ year: 2023, month: 2, day: 29, hour: 0, minute: 0 }, 'UTC', backend),
    ).toThrow(RangeError);
    expect(() =>
      resolveWallClock({ year: 2024, month: 1, day: 1, hour: 24, minute: 0 }, 'UTC', backend),
    ).toThrow(RangeError);
  });

  test('propagates an error for a zone the backend cannot load', () => {
    expect(() =>
      resolveWallClock(
        { year: 2024, month: 1, day: 1, hour: 0, minute: 0 },
        'Not/A_Zone',
        backend,
      ),
    ).toThrow();
  });
});
