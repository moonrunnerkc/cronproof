/**
 * systemd .timer unit scanner. Reads OnCalendar entries from the
 * [Timer] section. A calendar event is interpreted in the system local
 * time unless a zone is named, so this scanner treats the zone as
 * explicit only when one is actually written: either a trailing zone
 * token on the OnCalendar value (systemd calendar events accept a
 * trailing timezone) or a Timezone assignment in the unit. With
 * neither, the zone is UNKNOWN, because the daemon's local time is a
 * host property this file cannot reveal. See DECISIONS.md for the
 * cited systemd.time docs.
 */

import type { ScanFile, ScheduleFinding, ZoneSource } from '../types';

const ONCALENDAR_LINE = /^(\s*OnCalendar\s*=\s*)(.+?)\s*$/;
const TIMEZONE_LINE = /^\s*Timezone\s*=\s*(.+?)\s*$/;
const ZONE_TOKEN = /^(?:UTC|[A-Za-z][A-Za-z0-9_+-]*\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)$/;

function unitTimezone(lines: string[]): string | null {
  for (const line of lines) {
    const match = TIMEZONE_LINE.exec(line);
    if (match !== null) {
      return (match[1] ?? '').trim();
    }
  }
  return null;
}

function splitTrailingZone(value: string): { calendar: string; zone: string | null } {
  const parts = value.split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last !== undefined && ZONE_TOKEN.test(last)) {
    return { calendar: parts.slice(0, -1).join(' '), zone: last };
  }
  return { calendar: value, zone: null };
}

/**
 * Scans a systemd .timer unit for OnCalendar schedules.
 * @param file The file to scan.
 * @returns One finding per OnCalendar entry, zone taken from a trailing
 *          zone token or a unit Timezone, else UNKNOWN.
 */
export function scanSystemdTimer(file: ScanFile): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  const lines = file.text.split('\n');
  const timezone = unitTimezone(lines);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const match = ONCALENDAR_LINE.exec(line);
    if (match === null) {
      continue;
    }
    const prefix = match[1] ?? '';
    const { calendar, zone } = splitTrailingZone(match[2] ?? '');
    let zoneSource: ZoneSource;
    if (zone !== null) {
      zoneSource = { kind: 'explicit', zone };
    } else if (timezone !== null) {
      zoneSource = { kind: 'explicit', zone: timezone };
    } else {
      zoneSource = { kind: 'unknown' };
    }
    findings.push({
      file: file.path,
      line: i + 1,
      column: prefix.length + 1,
      sourceKind: 'systemd-timer',
      dialect: 'systemd',
      expression: calendar,
      resolution: 'resolved',
      zoneSource,
      warnings: [],
    });
  }
  return findings;
}
