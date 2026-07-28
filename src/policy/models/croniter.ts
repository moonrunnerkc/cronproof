/**
 * croniter (Python). Its README has an "About DST" section but, as
 * fetched 2026-07-27 (https://github.com/kiorky/croniter), it only
 * shows how to pass timezone-aware datetimes and does not document
 * what happens at a spring-forward gap or a fall-back fold. With no
 * documented convention and no observed run, both hazard branches are
 * UNDEFINED until phase 6.
 */

import { decideUndefinedAtHazards } from './common';
import type { PolicyModel } from '../types';

/** The croniter model, gap and fold unverified. */
export const croniterModel: PolicyModel = { id: 'croniter', decide: decideUndefinedAtHazards };
