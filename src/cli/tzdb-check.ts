/**
 * tzdb drift guard. A schedule proven safe under one tzdb release is
 * not necessarily safe under the next: a government can move a DST
 * boundary or abolish DST, and a firing that was fine becomes skipped
 * or doubled. cronproof's verdicts are only as current as the tzdb they
 * were computed against, so CI can pin the tzdb release it verified
 * with and fail when the runner's tzdb has moved, forcing a conscious
 * re-verification rather than a silent, stale pass.
 *
 * The pinned value is compared against the ICU (Intl) tzdb the runtime
 * carries, which is the release that varies from runner to runner.
 */

import { tzdbVersions } from '../tz/index';

/** Outcome of a tzdb pin comparison. */
export interface TzdbCheckResult {
  /** True when the runner's tzdb matches the pin. */
  ok: boolean;
  /** The runner's actual ICU tzdb release. */
  actual: string;
  /** The pinned release that was expected. */
  expected: string;
  /** A message describing the drift, empty when ok. */
  message: string;
}

/**
 * Compares the runtime's tzdb release against a pinned expectation.
 * @param expected The pinned tzdb release, for example "2025b".
 * @param zoneinfoRoot Zoneinfo root (does not affect the ICU version).
 * @returns Whether they match, the actual and expected values, and a
 *          drift message when they differ.
 */
export function checkTzdb(expected: string, zoneinfoRoot: string | undefined): TzdbCheckResult {
  const actual = tzdbVersions(zoneinfoRoot).intlTzdbVersion ?? 'unknown';
  if (actual === expected) {
    return { ok: true, actual, expected, message: '' };
  }
  return {
    ok: false,
    actual,
    expected,
    message:
      `tzdb drift: pinned ${expected} but the runner's ICU tzdb is ${actual}. ` +
      'A verdict computed against a different tzdb release may be stale; re-verify against ' +
      `${actual} and update the pin, or install the ${expected} tzdata on the runner.`,
  };
}
