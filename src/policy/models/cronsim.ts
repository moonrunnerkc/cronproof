/**
 * cronsim (Python, the library behind Healthchecks.io). Added and
 * verified in phase 6 by running cronsim 2.7 in a container across
 * both transitions in Europe/Berlin and America/New_York (fixture
 * test/differential/fixtures/cronsim.json). Observed: a folded local
 * time fires once at the earlier instant for a fixed daily schedule
 * and twice for an interval schedule; a skipped local time fires once
 * at the transition instant (the moment after the jump) for a fixed
 * schedule and is dropped for an interval schedule. This matches
 * cronsim's documented aim of Debian-cron-compatible DST handling.
 */

import { profileDecider } from './profile';
import type { PolicyModel } from '../types';

/** The cronsim model, verified against a real run. */
export const cronsimModel: PolicyModel = {
  id: 'cronsim',
  decide: profileDecider({
    ambiguousFixed: 'once-earlier',
    ambiguousInterval: 'twice',
    nonexistentFixed: 'once-at-transition',
    nonexistentInterval: 'does-not-fire',
  }),
};
