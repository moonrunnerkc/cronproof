/**
 * node-cron. Verified in phase 6 by running node-cron 3.0.3 under a
 * virtual-clock discrete-event driver (its own scheduler code, with
 * Date and the timers intercepted), across both transitions in
 * Europe/Berlin and America/New_York (fixture
 * test/differential/fixtures/node-cron.json). node-cron schedules
 * with real-duration timers that a faked wall clock cannot
 * accelerate, so the virtual-clock driver is how its real logic was
 * observed. Observed, matching its README: a folded local time fires
 * once at the earlier instant and the repeated hour is not revisited
 * (for a fixed or an interval schedule); a skipped local time is
 * dropped.
 */

import { profileDecider } from './profile';
import type { PolicyModel } from '../types';

/** The node-cron model, verified against its real scheduler. */
export const nodeCronModel: PolicyModel = {
  id: 'node-cron',
  decide: profileDecider({
    ambiguousFixed: 'once-earlier',
    ambiguousInterval: 'once-earlier',
    nonexistentFixed: 'does-not-fire',
    nonexistentInterval: 'does-not-fire',
  }),
};
