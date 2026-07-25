/**
 * Exposes the tzdb version of each data source separately: the copy
 * bundled with the JavaScript runtime's ICU (used by the Intl
 * backend) and the compiled zoneinfo tree (used by the TZif
 * backend). A verdict computed against a stale tzdb is worth
 * nothing, so disagreement between the two must be surfaced loudly.
 */

import { readZoneinfoVersion, resolveZoneinfoRoot } from './zoneinfo-source';

/** tzdb versions of the two independent data sources. */
export interface TzdbVersions {
  /** tzdb version bundled with the runtime's ICU, or null if unknown. */
  intlTzdbVersion: string | null;
  /** tzdb version of the zoneinfo root, or null if undeclared. */
  zoneinfoTzdbVersion: string | null;
  /** The zoneinfo root the version was read from. */
  zoneinfoRoot: string;
}

/**
 * Reads both tzdb versions. The Intl side comes from
 * process.versions.tz; the zoneinfo side from the root's +VERSION
 * file or tzdata.zi header.
 */
export function tzdbVersions(zoneinfoRoot?: string): TzdbVersions {
  const root = resolveZoneinfoRoot(zoneinfoRoot);
  return {
    intlTzdbVersion: process.versions.tz ?? null,
    zoneinfoTzdbVersion: readZoneinfoVersion(root),
    zoneinfoRoot: root,
  };
}

/**
 * Returns a loud multi-line warning when the two tzdb versions
 * disagree or either is unknown, or null when they match.
 */
export function tzdbVersionWarning(versions: TzdbVersions): string | null {
  const { intlTzdbVersion, zoneinfoTzdbVersion } = versions;
  if (intlTzdbVersion === null || zoneinfoTzdbVersion === null) {
    return [
      'WARNING: a tzdb version could not be determined.',
      `  Intl (ICU) tzdb: ${intlTzdbVersion ?? 'unknown'}`,
      `  zoneinfo tzdb:   ${zoneinfoTzdbVersion ?? 'unknown'} (${versions.zoneinfoRoot})`,
      '  Results cannot be tied to a known tzdb release.',
    ].join('\n');
  }
  if (intlTzdbVersion === zoneinfoTzdbVersion) {
    return null;
  }
  return [
    '################################################################',
    'WARNING: tzdb VERSION MISMATCH between the two data sources.',
    `  Intl (ICU) tzdb: ${intlTzdbVersion}`,
    `  zoneinfo tzdb:   ${zoneinfoTzdbVersion} (${versions.zoneinfoRoot})`,
    '  One of these databases is stale. Offsets and transitions that',
    '  changed between the releases WILL differ between backends, and',
    '  any verdict computed against the stale side is worth nothing.',
    '################################################################',
  ].join('\n');
}
