/**
 * The "fixed-time" test that Debian cron's DST branch keys off, and
 * the shift magnitude a resolution implies. Debian's rule, from
 * cron(8): special handling applies only to jobs "not specified as
 * @hourly, nor with '*' in the hour or minute specifier". That is a
 * textual property of the source, which phase 3 preserves as the
 * startsWithAsterisk flag on each field, not a semantic one, so a
 * stepped minute beginning with an asterisk counts as a wildcard even
 * though it names specific minutes.
 */

import type { CronAst } from '../cron/index';
import type { WallClockResolution } from '../tz/index';

/** Three hours in milliseconds, Debian's threshold for special handling. */
export const THREE_HOURS_MILLIS = 3 * 3_600_000;

/**
 * True when neither the minute nor the hour field begins with an
 * asterisk. This is Debian's definition of a fixed-time job and the
 * only jobs its DST compensation touches. @reboot schedules are never
 * fixed-time here.
 */
export function isFixedTime(ast: CronAst): boolean {
  if (ast.reboot) {
    return false;
  }
  return !ast.minute.startsWithAsterisk && !ast.hour.startsWithAsterisk;
}

/**
 * Magnitude of the offset shift implied by a resolution, in
 * milliseconds. A gap's duration and a fold's duration both equal the
 * absolute offset change, so this is defined for the two hazard
 * resolutions and zero for a unique time.
 */
export function shiftMagnitudeMillis(resolution: WallClockResolution): number {
  switch (resolution.kind) {
    case 'nonexistent':
      return resolution.gapDurationMilliseconds;
    case 'ambiguous':
      return resolution.foldDurationMilliseconds;
    case 'unique':
      return 0;
  }
}
