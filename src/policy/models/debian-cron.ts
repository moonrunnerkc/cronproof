/**
 * debian-cron. Modeled from cron(8) on Debian (fetched 2026-07-27,
 * https://manpages.debian.org/bookworm/cron/cron.8.en.html) and
 * verified in phase 6 by running cron 3.0pl1 under libfaketime with a
 * stepped clock across both transitions in Europe/Berlin and
 * America/New_York (fixture test/differential/fixtures/debian-cron.json).
 * Observed and predicted match exactly: a fixed-time job fires once at
 * the earlier instant on fall-back and once just after the jump (at
 * the transition instant) on spring-forward; a wildcard job gets no
 * compensation, firing the folded hour twice and skipping the gap.
 * The shared rule lives in vixie-family.
 */

import { vixieFamilyDecide } from './vixie-family';
import type { PolicyModel } from '../types';

/** The debian-cron model, verified against a real daemon run. */
export const debianCronModel: PolicyModel = { id: 'debian-cron', decide: vixieFamilyDecide };
