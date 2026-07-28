/**
 * The differential report: run every applicable policy over one
 * schedule and show where they disagree. Away from a transition every
 * scheduler fires each firing once at the same instant, so the only
 * points that can disagree are the firings a zone made nonexistent or
 * ambiguous. Total agreement across policies means the schedule is
 * safe to port between them; any disagreement, or any UNDEFINED
 * branch, is a portability hazard, a finding distinct from the DST
 * hazard itself.
 */

import { enumerate, type CronAst, type DialectId, type LocalFiring } from '../cron/index';
import { resolveWallClock, type TzBackend } from '../tz/index';
import { ALL_POLICY_IDS, policyModel, policyVerification } from './registry';
import { outcomeInstants, type PolicyId, type PolicyOutcome, type PolicyParams, type Verification } from './types';

/** A firing whose local time is nonexistent or ambiguous. */
export interface DecisionPoint {
  /** Intended local firing time. */
  intendedLocal: LocalFiring;
  /** Which hazard resolution applies. */
  resolutionKind: 'nonexistent' | 'ambiguous';
}

/** One policy's outcome at one decision point. */
export interface PolicyCell {
  /** The outcome discriminant. */
  outcomeKind: PolicyOutcome['kind'];
  /** Instants the policy actually fires at (empty for none or undefined). */
  instants: number[];
  /** True when the policy's behavior here is UNDEFINED. */
  undefinedOutcome: boolean;
}

/** One policy's column across all decision points. */
export interface PolicyColumn {
  /** Scheduler id. */
  policyId: PolicyId;
  /** Verification status of the model. */
  verification: Verification;
  /** Cells aligned with the report's decision points. */
  cells: PolicyCell[];
  /** Total instants fired across the decision points. */
  hazardFiringCount: number;
}

/** How two policies relate across the schedule. */
export type PairRelation = 'agree' | 'differ' | 'undetermined';

/** A pairwise relation between two policies. */
export interface PolicyPair {
  /** First policy. */
  a: PolicyId;
  /** Second policy. */
  b: PolicyId;
  /** Their relation over the decision points. */
  relation: PairRelation;
}

/** The full differential report for one schedule. */
export interface DifferentialReport {
  /** Source expression. */
  expression: string;
  /** Dialect. */
  dialect: DialectId;
  /** Zone evaluated in. */
  zone: string;
  /** The firings that can disagree. */
  decisionPoints: DecisionPoint[];
  /** One column per policy. */
  columns: PolicyColumn[];
  /** Pairwise relations for every unordered policy pair. */
  pairs: PolicyPair[];
  /** total-agreement (safe to port) or disagreement (portability hazard). */
  verdict: 'total-agreement' | 'disagreement';
  /** True exactly when the verdict is total-agreement. */
  safeToPort: boolean;
}

/** Inputs to the differential report. */
export interface DifferentialInput {
  /** Parsed schedule. */
  ast: CronAst;
  /** Source expression, for the report. */
  expression: string;
  /** Dialect the ast was parsed under. */
  dialect: DialectId;
  /** Zone to evaluate in. */
  zone: string;
  /** Inclusive lower wall-clock bound. */
  from: LocalFiring;
  /** Exclusive upper wall-clock bound. */
  to: LocalFiring;
  /** Timezone backend. */
  backend: TzBackend;
  /** Scheduler parameters. */
  params?: PolicyParams;
  /** Policies to run; defaults to all registered policies. */
  policyIds?: PolicyId[];
}

function sameInstants(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const x = [...a].sort((m, n) => m - n);
  const y = [...b].sort((m, n) => m - n);
  return x.every((value, index) => value === y[index]);
}

function relationBetween(left: PolicyColumn, right: PolicyColumn): PairRelation {
  let differ = false;
  let undetermined = false;
  for (let i = 0; i < left.cells.length; i += 1) {
    const a = left.cells[i];
    const b = right.cells[i];
    if (a === undefined || b === undefined) {
      continue;
    }
    if (a.undefinedOutcome || b.undefinedOutcome) {
      undetermined = true;
    } else if (!sameInstants(a.instants, b.instants)) {
      differ = true;
    }
  }
  return differ ? 'differ' : undetermined ? 'undetermined' : 'agree';
}

/** Runs every applicable policy over the schedule and builds the report. */
export function runDifferential(input: DifferentialInput): DifferentialReport {
  const params = input.params ?? {};
  const policyIds = input.policyIds ?? ALL_POLICY_IDS;
  const firings = enumerate(input.ast, { zone: input.zone, from: input.from, to: input.to });

  const decisionPoints: DecisionPoint[] = [];
  const decided: { local: LocalFiring; resolution: ReturnType<typeof resolveWallClock> }[] = [];
  for (const local of firings) {
    const resolution = resolveWallClock(local, input.zone, input.backend);
    if (resolution.kind === 'unique') {
      continue;
    }
    decisionPoints.push({ intendedLocal: local, resolutionKind: resolution.kind });
    decided.push({ local, resolution });
  }

  const columns: PolicyColumn[] = policyIds.map((policyId) => {
    const model = policyModel(policyId);
    const cells: PolicyCell[] = decided.map((point) => {
      const outcome = model.decide({ local: point.local, resolution: point.resolution }, input.ast, params);
      return {
        outcomeKind: outcome.kind,
        instants: outcomeInstants(outcome),
        undefinedOutcome: outcome.kind === 'UNDEFINED',
      };
    });
    return {
      policyId,
      verification: policyVerification(policyId),
      cells,
      hazardFiringCount: cells.reduce((sum, cell) => sum + cell.instants.length, 0),
    };
  });

  const pairs: PolicyPair[] = [];
  let anyDiffer = false;
  let anyUndetermined = false;
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const left = columns[i];
      const right = columns[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      const relation = relationBetween(left, right);
      pairs.push({ a: left.policyId, b: right.policyId, relation });
      if (relation === 'differ') {
        anyDiffer = true;
      } else if (relation === 'undetermined') {
        anyUndetermined = true;
      }
    }
  }

  const safeToPort = !anyDiffer && !anyUndetermined;
  return {
    expression: input.expression,
    dialect: input.dialect,
    zone: input.zone,
    decisionPoints,
    columns,
    pairs,
    verdict: safeToPort ? 'total-agreement' : 'disagreement',
    safeToPort,
  };
}

/** The relation between two policies in a report, or undefined if unlisted. */
export function pairRelation(report: DifferentialReport, a: PolicyId, b: PolicyId): PairRelation | undefined {
  const pair = report.pairs.find(
    (candidate) => (candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a),
  );
  return pair?.relation;
}
