/**
 * systemd-timer. Persistent= is modeled as a parameter: when true,
 * "the time when the service unit was last triggered is stored on
 * disk [...] the service unit is triggered immediately if it would
 * have been triggered at least once during the time when the timer
 * was inactive" (systemd.timer(5), fetched 2026-07-27,
 * https://man7.org/linux/man-pages/man5/systemd.timer.5.html). That
 * catches up runs missed while the system was off, a different axis
 * from a DST gap or fold.
 *
 * The man page does not document how OnCalendar elapse is resolved
 * across a DST gap or fold, and this project has not run systemd to
 * observe it, so both hazard branches are UNDEFINED until phase 6.
 * Persistent= does not settle them: it recovers downtime, not a
 * nonexistent or repeated wall-clock time.
 */

import { baselineUnique } from './common';
import type { PolicyModel, PolicyOutcome, ResolvedFiring } from '../types';

function decide(firing: ResolvedFiring): PolicyOutcome {
  return baselineUnique(firing.resolution) ?? { kind: 'UNDEFINED' };
}

/** The systemd-timer model; Persistent= is carried as a parameter. */
export const systemdTimerModel: PolicyModel = { id: 'systemd-timer', decide };
