import { describe, expect, test } from 'vitest';
import { checkTzdb } from '../../src/cli/tzdb-check';
import { tzdbVersions } from '../../src/tz/index';

const actual = tzdbVersions(undefined).intlTzdbVersion ?? 'unknown';

describe('tzdb drift check', () => {
  test('a pin matching the runner tzdb passes', () => {
    const result = checkTzdb(actual, undefined);
    expect(result.ok).toBe(true);
    expect(result.actual).toBe(actual);
  });

  test('a deliberately wrong pin fails and names both releases', () => {
    const result = checkTzdb('1999z', undefined);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('1999z');
    expect(result.message).toContain(actual);
  });
});
