/**
 * cron-parser (npm, Luxon-backed). Verified in phase 6 by running
 * cron-parser 4.9.0 in a container across both transitions in
 * Europe/Berlin and America/New_York (fixture
 * test/differential/fixtures/cron-parser-luxon.json). Observed: a
 * folded local time fires once at the earlier instant for a fixed
 * daily schedule and twice for an interval schedule; a skipped local
 * time is shifted forward by the gap and fires once (02:30 becomes
 * 03:30) for a fixed schedule, and is dropped for an interval
 * schedule. The forward shift of a skipped time is Luxon's default
 * and is a divergence from every other scheduler modeled; see
 * FINDINGS.md.
 */

import { profileDecider } from './profile';
import type { PolicyModel } from '../types';

/** The cron-parser-luxon model, verified against a real run. */
export const cronParserLuxonModel: PolicyModel = {
  id: 'cron-parser-luxon',
  decide: profileDecider({
    ambiguousFixed: 'once-earlier',
    ambiguousInterval: 'twice',
    nonexistentFixed: 'once-shifted-forward',
    nonexistentInterval: 'does-not-fire',
  }),
};
