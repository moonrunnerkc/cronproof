/**
 * Shared analysis used by the commands: resolving the zoneinfo root,
 * building the timezone backend, the internal verification that
 * guards exit code 3, and flattening a hazard into a view row.
 *
 * The zoneinfo root defaults to the copy vendored with this package. It
 * matches the ICU tzdb of the Node release pinned in .nvmrc, so a default
 * run on that Node does not trip the tzdb-mismatch check. On a Node whose
 * ICU ships a different tzdb release, or with --zoneinfo-root pointed at a
 * divergent tree, the mismatch is caught and reported as an internal
 * failure rather than answered against a stale rule set.
 */

import {
  createIntlBackend,
  createTzifBackend,
  crossCheckZone,
  resolveZoneinfoRoot,
  tzdbVersions,
  vendoredZoneinfoRoot,
  wallMillisFromFields,
  type TzifBackend,
} from '../tz/index';
import type { LocalFiring } from '../cron/index';

// The pure view helpers live in the browser-safe analyze layer; the CLI
// re-exports them so its own imports and the web playground stay in sync.
export { hazardToView, isoUtc, severityOrder } from '../analyze/index';

const DAY_MILLIS = 86_400_000;

/** Resolves the zoneinfo root: explicit, else vendored, else system. */
export function resolveRoot(explicit: string | null): string {
  if (explicit !== null) {
    return resolveZoneinfoRoot(explicit);
  }
  return vendoredZoneinfoRoot() ?? resolveZoneinfoRoot();
}

/** Creates the TZif backend for a root. */
export function makeBackend(root: string): TzifBackend {
  return createTzifBackend({ zoneinfoRoot: root });
}

/**
 * Compares the two tzdb releases every answer rests on: the one compiled
 * into the runtime's ICU and the one the zoneinfo root declares. This is
 * zone-independent and window-independent, which is why the dispatcher
 * runs it ahead of every command rather than leaving it to the commands
 * that happen to take a zone.
 * @param root Zoneinfo root the TZif backend will read.
 * @returns A message naming both releases and both remedies, or null when they match.
 */
export function tzdbAgreementFailure(root: string): string | null {
  const versions = tzdbVersions(root);
  if (
    versions.intlTzdbVersion === null ||
    versions.zoneinfoTzdbVersion === null ||
    versions.intlTzdbVersion === versions.zoneinfoTzdbVersion
  ) {
    return null;
  }
  return (
    `tzdb mismatch: ICU has ${versions.intlTzdbVersion} but the zoneinfo root ` +
    `${versions.zoneinfoRoot} has ${versions.zoneinfoTzdbVersion}. A verdict computed ` +
    `against a stale tzdb is worth nothing. Either run on a Node whose ICU tzdb is ` +
    `${versions.zoneinfoTzdbVersion} (the version in .nvmrc ships it), or pass ` +
    `--zoneinfo-root pointing at a tzdb tree whose +VERSION reads ` +
    `${versions.intlTzdbVersion}.`
  );
}

/**
 * Runs the internal verification that gates exit code 3: the two tzdb
 * sources must agree, and the two independent timezone backends must
 * agree on every transition in the window. Returns null when clean,
 * or a message describing the failure.
 */
export function internalVerification(
  backend: TzifBackend,
  zone: string,
  from: LocalFiring,
  to: LocalFiring,
  root: string,
): string | null {
  const mismatch = tzdbAgreementFailure(root);
  if (mismatch !== null) {
    return mismatch;
  }
  const startUtc = wallMillisFromFields(from) - DAY_MILLIS;
  const endUtc = wallMillisFromFields(to) + DAY_MILLIS;
  const result = crossCheckZone(createIntlBackend(), backend, zone, startUtc, endUtc);
  if (result.disagreements.length > 0) {
    const first = result.disagreements[0];
    return `backend disagreement in ${zone}: ${first?.detail ?? 'unknown'}`;
  }
  return null;
}

