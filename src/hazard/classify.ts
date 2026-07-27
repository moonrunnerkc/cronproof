/**
 * The hazard classifier. Given a parsed schedule, a zone, and a
 * wall-clock window, it enumerates the intended firings, resolves
 * each through the timezone engine, and reports every hazard: skipped
 * and doubled firings for point schedules, interval drift for
 * interval-like schedules, count anomalies for calendar days that do
 * not exist, and a zone-unstable label for predicted regions.
 *
 * Enumeration and resolution stay separate (phases 3 and 2); this
 * module is the join between them and owns no calendar or offset math
 * of its own.
 */

import { parse, type CronAst } from '../cron/index';
import { wallMillisFromFields, type TzBackend } from '../tz/index';
import { countAnomalyHazards } from './count-anomaly';
import { intervalDriftHazards } from './interval-drift';
import { perFiringHazards } from './per-firing';
import { enumerateFirings, resolveFirings } from './resolve-firings';
import { severityRank } from './severity';
import { zoneUnstableHazards } from './zone-unstable';
import type { ClassifyInput, Hazard } from './types';

/**
 * True when the schedule fires several times an hour at a fixed
 * cadence: the minute field literally begins with an asterisk (a
 * wildcard or step) and matches more than one minute. Such schedules
 * report transition effects as INTERVAL_DRIFT rather than as a run of
 * skipped or doubled firings.
 */
export function isIntervalLike(ast: CronAst): boolean {
  return ast.minute.startsWithAsterisk && ast.minute.values.length > 1;
}

function sortHazards(hazards: Hazard[]): Hazard[] {
  return [...hazards].sort((a, b) => {
    const bySeverity = severityRank(b.severity) - severityRank(a.severity);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    return wallMillisFromFields(a.intendedLocal) - wallMillisFromFields(b.intendedLocal);
  });
}

/**
 * Classifies every timezone hazard for one schedule in one zone over
 * the window. The ast must already be parsed under the given dialect.
 */
export function classifyHazards(ast: CronAst, backend: TzBackend, input: ClassifyInput): Hazard[] {
  const idempotent = input.idempotent ?? false;
  const firings = enumerateFirings(ast, input.zone, input.from, input.to);
  const hazards: Hazard[] = [];

  if (isIntervalLike(ast)) {
    hazards.push(
      ...intervalDriftHazards(
        firings,
        input.expression,
        input.dialect,
        input.zone,
        input.from,
        input.to,
        backend,
        idempotent,
      ),
    );
  } else {
    const resolved = resolveFirings(firings, input.zone, backend);
    hazards.push(
      ...perFiringHazards(resolved, input.expression, input.dialect, input.zone, backend, idempotent),
    );
    hazards.push(
      ...countAnomalyHazards(resolved, input.expression, input.dialect, input.zone, backend, idempotent),
    );
  }

  hazards.push(
    ...zoneUnstableHazards(firings, input.expression, input.dialect, input.zone, input.zoneinfoRoot, idempotent),
  );
  return sortHazards(hazards);
}

/**
 * Convenience entry point that parses the expression and classifies
 * in one call. Throws when the expression does not parse under the
 * dialect, with the first located error.
 */
export function classifyExpression(input: ClassifyInput, backend: TzBackend): Hazard[] {
  const parsed = parse(input.expression, input.dialect);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    throw new Error(
      `cannot classify: "${input.expression}" is invalid ${input.dialect}` +
        (first === undefined ? '' : ` at offset ${first.offset}: ${first.reason}`),
    );
  }
  return classifyHazards(parsed.ast, backend, input);
}
