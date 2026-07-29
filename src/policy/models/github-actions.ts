/**
 * GitHub Actions scheduled workflows. Added because the CLI already
 * accepted --dialect github-actions: an Actions expression parsed as
 * Actions and was then answered with what ten other schedulers would
 * do, none of which was GitHub.
 *
 * The gap branch is documented, so it is modeled: "For schedules that
 * set `timezone` to a time zone that observes daylight saving time
 * (DST), during DST spring-forward transitions, scheduled workflows in
 * skipped hours advance to the next valid time. For example, a 2:30 AM
 * schedule advances to 3:00 AM."
 * (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows,
 * fetched 2026-07-29). The next valid time is the transition instant
 * itself, not the intended offset carried past it: 2:30 becomes 3:00,
 * not 3:30. That is a compensating run for a slot that never
 * happened, which is FIRES_AT_CATCHUP.
 *
 * The documented example is a fixed daily time, one slot in the gap.
 * An interval schedule puts several slots in the same gap, and the
 * page says nothing about whether they all land on the transition
 * instant or collapse. Applying the rule literally would report six
 * firings at one identical instant for an every-ten-minutes schedule,
 * which the docs do not support any more than one firing does, so the
 * interval gap is UNDEFINED rather than a literal reading presented
 * as fact.
 *
 * The fold branch is not documented on that page either. A repeated
 * local hour could plausibly fire once or twice, and a plausible
 * answer stated as fact is the failure mode this project exists to
 * avoid, so it stays UNDEFINED until a real run settles it.
 */

import { baselineUnique } from './common';
import { isFixedTime } from '../fixed-time';
import type { CronAst } from '../../cron/index';
import type { PolicyModel, PolicyOutcome, ResolvedFiring } from '../types';

function decide(firing: ResolvedFiring, ast: CronAst): PolicyOutcome {
  const baseline = baselineUnique(firing.resolution);
  if (baseline !== null) {
    return baseline;
  }
  if (firing.resolution.kind === 'nonexistent' && isFixedTime(ast)) {
    return { kind: 'FIRES_AT_CATCHUP', instant: firing.resolution.transitionInstant };
  }
  return { kind: 'UNDEFINED' };
}

/** The github-actions model: documented gap catch-up, undocumented fold. */
export const githubActionsModel: PolicyModel = { id: 'github-actions', decide };
