/**
 * cronie (the cron shipped on Red Hat and Fedora). Its DST handling
 * must not be assumed to match Debian's: the two are separate
 * codebases, and this project has not run cronie to confirm its gap
 * and fold behavior. Both hazard branches are therefore UNDEFINED
 * until phase 6 verifies them against the real scheduler. Marking a
 * branch UNDEFINED is the correct answer here, not a placeholder for
 * a guess.
 */

import { decideUndefinedAtHazards } from './common';
import type { PolicyModel } from '../types';

/** The cronie model, gap and fold unverified. */
export const cronieModel: PolicyModel = { id: 'cronie', decide: decideUndefinedAtHazards };
