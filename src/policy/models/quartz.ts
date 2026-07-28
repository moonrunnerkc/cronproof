/**
 * quartz (the Java scheduler). Quartz misfire instructions are
 * modeled as parameters (params.quartzMisfire): SMART_POLICY is the
 * documented default that "dynamically chooses between its various
 * MISFIRE instructions" (Quartz tutorial, fetched 2026-07-27,
 * https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/tutorial-lesson-05.html),
 * alongside fire-once-now and do-nothing. Misfire instructions govern
 * what happens to fires missed while the scheduler was down or its
 * thread pool was saturated, which is a different axis from a DST gap
 * or fold.
 *
 * Quartz's behavior at a spring-forward gap or a fall-back fold is
 * not established from a source fetched in this session, so both
 * hazard branches are UNDEFINED until phase 6 runs Quartz. The
 * misfire parameter does not rescue this: it does not define the DST
 * resolution, only the missed-fire recovery.
 */

import { baselineUnique } from './common';
import type { PolicyModel, PolicyOutcome, ResolvedFiring } from '../types';

function decide(firing: ResolvedFiring): PolicyOutcome {
  return baselineUnique(firing.resolution) ?? { kind: 'UNDEFINED' };
}

/** The quartz model; misfire variants are carried as parameters. */
export const quartzModel: PolicyModel = { id: 'quartz', decide };
