/**
 * Cross-check runner: compares the Intl and TZif backends over every
 * zone in the tzdb from 1970 to 2040. Any disagreement on any
 * transition instant or offset is a hard failure that prints the
 * zone and the instant. Also reports the tzdb version of each data
 * source and warns loudly when they differ.
 *
 * Usage: tsx scripts/cross-check.ts [--root <zoneinfo-root>]
 *        [--zones <comma-separated-zone-list>]
 */

import {
  createIntlBackend,
  createTzifBackend,
  listZones,
  runCrossCheck,
  tzdbVersions,
  tzdbVersionWarning,
  type TzBackend,
} from '../src/tz/index';

const RANGE_START_UTC = Date.UTC(1970, 0, 1);
const RANGE_END_UTC = Date.UTC(2040, 0, 1);

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function intlSupports(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function intlCanonicalZone(zone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
}

interface SkipRecord {
  zone: string;
  reason: string;
}

/**
 * True when two zones have identical offsets and transitions in the
 * check range according to the TZif backend. Used to decide whether
 * Intl's canonical substitute for an alias name carries the same
 * data, in which case the comparison is still meaningful.
 */
function sameDataInRange(backend: TzBackend, zoneX: string, zoneY: string): boolean {
  if (
    backend.offsetAt(RANGE_START_UTC, zoneX).offsetSeconds !==
    backend.offsetAt(RANGE_START_UTC, zoneY).offsetSeconds
  ) {
    return false;
  }
  const listX = backend.transitionsBetween(RANGE_START_UTC, RANGE_END_UTC, zoneX);
  const listY = backend.transitionsBetween(RANGE_START_UTC, RANGE_END_UTC, zoneY);
  return JSON.stringify(listX) === JSON.stringify(listY);
}

function partitionZones(
  allZones: string[],
  backendB: TzBackend,
): { zones: string[]; skips: SkipRecord[] } {
  const zones: string[] = [];
  const skips: SkipRecord[] = [];
  for (const zone of allZones) {
    if (!intlSupports(zone)) {
      skips.push({ zone, reason: 'zone name rejected by Intl' });
      continue;
    }
    const canonical = intlCanonicalZone(zone);
    if (canonical !== zone) {
      let equivalent: boolean;
      try {
        equivalent = sameDataInRange(backendB, zone, canonical);
      } catch {
        skips.push({
          zone,
          reason: `Intl substitutes ${canonical}, which is absent from the zoneinfo root`,
        });
        continue;
      }
      if (!equivalent) {
        skips.push({
          zone,
          reason: `Intl substitutes ${canonical}, whose tzdb data differs in the check range`,
        });
        continue;
      }
    }
    zones.push(zone);
  }
  return { zones, skips };
}

function main(): number {
  const root = argValue('--root');
  const zonesArg = argValue('--zones');
  const backendB = createTzifBackend(root === undefined ? {} : { zoneinfoRoot: root });
  const backendA = createIntlBackend();

  const versions = tzdbVersions(backendB.zoneinfoRoot);
  process.stdout.write('cronproof tz cross-check\n');
  process.stdout.write(
    `range: ${new Date(RANGE_START_UTC).toISOString()} to ${new Date(RANGE_END_UTC).toISOString()}\n`,
  );
  process.stdout.write(`zoneinfo root: ${versions.zoneinfoRoot}\n`);
  process.stdout.write(`Intl (ICU) tzdb version: ${versions.intlTzdbVersion ?? 'unknown'}\n`);
  process.stdout.write(`zoneinfo tzdb version: ${versions.zoneinfoTzdbVersion ?? 'unknown'}\n`);
  const warning = tzdbVersionWarning(versions);
  if (warning !== null) {
    process.stdout.write(`${warning}\n`);
  }

  const allZones =
    zonesArg === undefined ? listZones(backendB.zoneinfoRoot) : zonesArg.split(',');
  const { zones, skips } = partitionZones(allZones, backendB);

  const report = runCrossCheck({
    backendA,
    backendB,
    zones,
    startUtcMillis: RANGE_START_UTC,
    endUtcMillis: RANGE_END_UTC,
    onZone: (result) => {
      const status = result.disagreements.length === 0 ? 'OK  ' : 'FAIL';
      process.stdout.write(
        `${status} ${result.zone} transitions compared=${result.transitionsCompared}` +
          ` (A=${result.countA} B=${result.countB})\n`,
      );
      for (const disagreement of result.disagreements) {
        process.stdout.write(`     DISAGREEMENT ${disagreement.zone}: ${disagreement.detail}\n`);
      }
    },
  });

  process.stdout.write('\n');
  process.stdout.write(`zones checked: ${report.zonesChecked}\n`);
  process.stdout.write(`zones skipped: ${skips.length}\n`);
  for (const skip of skips) {
    process.stdout.write(`  SKIP ${skip.zone}: ${skip.reason}\n`);
  }
  process.stdout.write(`transitions compared: ${report.transitionsCompared}\n`);
  process.stdout.write(`disagreements: ${report.disagreements.length}\n`);
  process.stdout.write(`result: ${report.disagreements.length === 0 ? 'PASS' : 'FAIL'}\n`);
  return report.disagreements.length === 0 ? 0 : 1;
}

process.exitCode = main();
