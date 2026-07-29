/**
 * GitHub Actions schedule scanner. Reads on.schedule entries: the cron
 * string and, when the workflow sets one, the sibling timezone key that
 * governs it.
 *
 * The zone is derived from the file, never assumed. An earlier version
 * of this scanner stamped `platform-default UTC` on every finding
 * because the platform had no timezone knob when it was written; the
 * knob exists now, and a baked-in constant reported seven zone-aware
 * schedules as UTC with no hazard at all. UTC remains the default, but
 * it is the answer only when the file does not say otherwise:
 * "By default, scheduled workflows run in UTC. You can optionally
 * specify a timezone using an IANA timezone string"
 * (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows,
 * fetched 2026-07-28).
 *
 * The timezone lookup is scoped to the sequence item the cron key
 * belongs to, by indentation. A nearby-line search would let the next
 * list item's zone leak onto this one, which is worse than no zone at
 * all: it would name a zone the schedule does not run in.
 */

import { looksTemplated, unquote } from '../text-locate';
import type { ScanContext, ScanFile, ScheduleFinding, ZoneSource } from '../types';
import { hasLocalIntent } from './local-intent';
import { intentContext, itemBounds, parseKeyLine, type KeyLine } from './yaml-item';

const UTC_RULE = 'GitHub Actions runs a scheduled workflow in UTC unless the schedule sets timezone';

/**
 * Drops a trailing `# comment` from a YAML scalar. A quoted scalar ends
 * at its closing quote, so a `#` inside the quotes stays: a quartz
 * day-of-week like `6#3` is part of the expression, not a comment.
 */
function stripInlineComment(raw: string): string {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const close = trimmed.indexOf(quote, 1);
    return close === -1 ? trimmed : trimmed.slice(0, close + 1);
  }
  if (quote === '#') {
    return '';
  }
  const hash = trimmed.search(/\s#/);
  return hash === -1 ? trimmed : trimmed.slice(0, hash);
}

/**
 * Finds the timezone key that governs one cron entry: a sibling key at
 * the cron key's own indentation, inside the same sequence item, in
 * either order (YAML does not fix the order of mapping keys).
 */
function zoneValueFor(lines: string[], cronIndex: number, cronKey: KeyLine): string | null {
  const bounds = itemBounds(lines, cronIndex, cronKey);
  for (let i = bounds.start; i <= bounds.end; i += 1) {
    if (i === cronIndex) {
      continue;
    }
    const key = parseKeyLine(lines[i] ?? '');
    if (key === null || key.keyIndent !== cronKey.keyIndent || key.name !== 'timezone') {
      continue;
    }
    const value = unquote(stripInlineComment(key.value)).trim();
    if (value !== '') {
      return value;
    }
  }
  return null;
}

/**
 * Turns the timezone value into a zone source, pushing a warning when
 * it cannot be trusted. A zone the tzdb does not know is reported
 * UNKNOWN rather than passed through: a typo that resolves silently is
 * how a schedule ends up proven safe in a zone that does not exist.
 */
function zoneSourceFor(zone: string, context: ScanContext, warnings: string[]): ZoneSource {
  if (looksTemplated(zone)) {
    warnings.push(
      `timezone is an unexpanded template (${zone}); the zone cannot be read from source`,
    );
    return { kind: 'unknown' };
  }
  const known = context.knownZones();
  if (known !== null && !known.has(zone)) {
    warnings.push(
      `timezone "${zone}" is not a zone name in the tzdb this run reads; ` +
        'correct it to an IANA name (cronproof zones lists them)',
    );
    return { kind: 'unknown' };
  }
  return { kind: 'explicit', zone };
}

/**
 * Scans a workflow YAML file for on.schedule cron entries.
 * @param file The file to scan.
 * @param context Ambient facts, used to tell a zone from a typo.
 * @returns One finding per cron entry: an explicit zone when the entry
 *          sets timezone, otherwise the platform's UTC default, warned
 *          when nearby prose implies the author meant local time.
 */
export function scanGithubActions(file: ScanFile, context: ScanContext): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  const lines = file.text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const key = parseKeyLine(lines[i] ?? '');
    if (key === null || key.name !== 'cron') {
      continue;
    }
    const value = stripInlineComment(key.value).trim();
    if (value === '') {
      continue;
    }
    const warnings: string[] = [];
    const declared = zoneValueFor(lines, i, key);
    const zoneSource =
      declared === null
        ? ({ kind: 'platform-default', zone: 'UTC', rule: UTC_RULE } as const)
        : zoneSourceFor(declared, context, warnings);
    // A schedule that declares its zone runs in local time correctly, so
    // the mismatch warning would be false: it is the undeclared ones,
    // left on the UTC default, where local-sounding prose is a bug.
    if (
      zoneSource.kind === 'platform-default' &&
      hasLocalIntent(intentContext(lines, i, key), context.knownZones())
    ) {
      warnings.push(
        'nearby comment or name implies local-time intent, but this schedule has no timezone and runs in UTC',
      );
    }
    findings.push({
      file: file.path,
      line: i + 1,
      column: key.prefix.length + 1,
      sourceKind: 'github-actions',
      dialect: 'github-actions',
      expression: unquote(value),
      resolution: 'resolved',
      zoneSource,
      warnings,
    });
  }
  return findings;
}
