/**
 * systemd-timer. Verified in phase 6 with `systemd-analyze calendar`
 * (systemd 249) across both transitions in Europe/Berlin and
 * America/New_York (fixture
 * test/differential/fixtures/systemd-timer.json). Observed: elapse
 * times are strictly monotonic, so a folded local time fires once at
 * the earlier instant (the repeated hour is not revisited, for a
 * fixed or an interval schedule), and a skipped local time is dropped
 * (no elapse lands in the gap; the next elapse is after it).
 *
 * Persistent= remains a parameter that catches up runs missed while
 * the system was off (systemd.timer(5)); it does not change the gap
 * or fold outcome, which is why it is not consulted here.
 */

import { profileDecider } from './profile';
import type { PolicyModel } from '../types';

/** The systemd-timer model, verified against systemd-analyze. */
export const systemdTimerModel: PolicyModel = {
  id: 'systemd-timer',
  decide: profileDecider({
    ambiguousFixed: 'once-earlier',
    ambiguousInterval: 'once-earlier',
    nonexistentFixed: 'does-not-fire',
    nonexistentInterval: 'does-not-fire',
  }),
};
