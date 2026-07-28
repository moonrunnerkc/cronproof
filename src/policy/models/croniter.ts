/**
 * croniter (Python). Verified in phase 6 by running croniter 6.2.4 in
 * a container across both transitions in Europe/Berlin and
 * America/New_York (fixture test/differential/fixtures/croniter.json).
 * Observed: a folded local time fires TWICE, at both instants, even
 * for a once-daily fixed schedule; a skipped local time fires once at
 * the transition instant for a fixed schedule and is dropped for an
 * interval schedule. The double-fire of a daily job at fall-back is a
 * notable divergence from the other libraries; see FINDINGS.md.
 */

import { profileDecider } from './profile';
import type { PolicyModel } from '../types';

/** The croniter model, verified against a real run. */
export const croniterModel: PolicyModel = {
  id: 'croniter',
  decide: profileDecider({
    ambiguousFixed: 'twice',
    ambiguousInterval: 'twice',
    nonexistentFixed: 'once-at-transition',
    nonexistentInterval: 'does-not-fire',
  }),
};
