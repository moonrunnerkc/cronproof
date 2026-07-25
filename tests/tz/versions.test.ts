import { describe, expect, test } from 'vitest';
import {
  tzdbVersions,
  tzdbVersionWarning,
  vendoredZoneinfoRoot,
} from '../../src/tz/index';

const vendorRoot = vendoredZoneinfoRoot();
if (vendorRoot === null) {
  throw new Error('vendored zoneinfo not found; run the vendoring step');
}

describe('tzdb version reporting', () => {
  test('reports the Intl tzdb version and the zoneinfo tzdb version separately', () => {
    const versions = tzdbVersions(vendorRoot);
    expect(versions.intlTzdbVersion).toBe(process.versions.tz ?? null);
    expect(versions.zoneinfoTzdbVersion).toBe('2025b');
    expect(versions.zoneinfoRoot).toBe(vendorRoot);
  });

  test('stays silent when both sources carry the same release', () => {
    expect(
      tzdbVersionWarning({
        intlTzdbVersion: '2025b',
        zoneinfoTzdbVersion: '2025b',
        zoneinfoRoot: '/x',
      }),
    ).toBeNull();
  });

  test('warns loudly when the releases disagree, naming both versions', () => {
    const warning = tzdbVersionWarning({
      intlTzdbVersion: '2025b',
      zoneinfoTzdbVersion: '2026b',
      zoneinfoRoot: '/usr/share/zoneinfo',
    });
    expect(warning).not.toBeNull();
    expect(warning).toContain('WARNING');
    expect(warning).toContain('2025b');
    expect(warning).toContain('2026b');
    expect(warning).toContain('stale');
  });

  test('warns when a version cannot be determined at all', () => {
    const warning = tzdbVersionWarning({
      intlTzdbVersion: null,
      zoneinfoTzdbVersion: '2025b',
      zoneinfoRoot: '/x',
    });
    expect(warning).toContain('could not be determined');
  });
});
