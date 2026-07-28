/**
 * cronie (the cron on Red Hat and Fedora). Phase 5 refused to assume
 * it matched Debian. Phase 6 ran cronie 1.7.2 on Fedora under
 * libfaketime with a stepped clock across both transitions in
 * Europe/Berlin and America/New_York (fixture
 * test/differential/fixtures/cronie.json) and observed behavior
 * identical to debian-cron on every scenario: fixed-time jobs fire
 * once at the earlier instant on fall-back and once at the transition
 * on spring-forward, wildcard jobs get no compensation. So cronie now
 * shares the Vixie-family decider, and its VERIFIED status rests on
 * its own fixture, not on the assumption phase 5 declined to make.
 * That the two match is itself a finding; see FINDINGS.md.
 */

import { vixieFamilyDecide } from './vixie-family';
import type { PolicyModel } from '../types';

/** The cronie model, verified against a real daemon run. */
export const cronieModel: PolicyModel = { id: 'cronie', decide: vixieFamilyDecide };
