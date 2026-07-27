/**
 * Assembles a {@link Hazard} from its parts, filling in the two
 * derived fields every hazard shares: the stable id (a hash of the
 * identity tuple) and the severity (from the kind and the schedule's
 * idempotence). Keeping this in one place means those two fields are
 * computed identically for every detector.
 */

import type { DialectId, LocalFiring } from '../cron/index';
import { hazardId } from './hazard-id';
import { severityFor } from './severity';
import type { CausingTransition, Hazard, HazardDetail, HazardKind } from './types';

/** Everything needed to build a hazard except its derived fields. */
export interface HazardDraft {
  /** Classification. */
  kind: HazardKind;
  /** Source expression. */
  expression: string;
  /** Dialect id. */
  dialect: DialectId;
  /** IANA zone. */
  zone: string;
  /** Intended local firing time (day at 00:00:00 for day-level hazards). */
  intendedLocal: LocalFiring;
  /** Resolved UTC instants. */
  instants: number[];
  /** Causing transition, or null. */
  causingTransition: CausingTransition | null;
  /** Kind-specific payload. */
  detail: HazardDetail;
  /** Whether the scheduled work is idempotent. */
  idempotent: boolean;
}

/** Builds a hazard, computing its stable id and severity. */
export function makeHazard(draft: HazardDraft): Hazard {
  return {
    id: hazardId({
      expression: draft.expression,
      dialect: draft.dialect,
      zone: draft.zone,
      intendedLocal: draft.intendedLocal,
      kind: draft.kind,
    }),
    kind: draft.kind,
    severity: severityFor(draft.kind, draft.idempotent),
    expression: draft.expression,
    dialect: draft.dialect,
    zone: draft.zone,
    intendedLocal: draft.intendedLocal,
    instants: draft.instants,
    causingTransition: draft.causingTransition,
    detail: draft.detail,
  };
}
