/**
 * The shared verdict builder. Given a parsed schedule, a timezone
 * backend, and a window, it produces the exact structured payload the
 * CLI's `check` command emits under `data`: the classified hazards as
 * view rows, a severity tally, and the scheduler policy differential.
 *
 * This is the single source of truth for what a verdict is. The CLI
 * calls it with the TZif backend; the web playground calls it with the
 * Intl backend. The 50-case parity test asserts the two backends drive
 * this same function to identical output.
 */

import { classifyHazards, type Hazard } from '../hazard/index';
import type { CronAst, DialectId, LocalFiring } from '../cron/index';
import type { TzBackend } from '../tz/index';
import {
  runDifferential,
  type DecisionPoint,
  type DifferentialReport,
  type PolicyPair,
  type Verification,
} from '../policy/index';
import { hazardToView, isoUtc, type HazardView } from './hazard-view';

/** One policy column as it appears in a verdict: outcomes with ISO instants. */
export interface VerdictPolicyColumn {
  /** Scheduler policy id. */
  policyId: string;
  /** Whether the model is empirically verified or asserted. */
  verification: Verification;
  /** Per decision point, what the scheduler does. */
  outcomes: { kind: string; instants: string[] }[];
}

/** The scheduler differential as it appears in a verdict. */
export interface VerdictDifferential {
  /** total-agreement or disagreement. */
  verdict: 'total-agreement' | 'disagreement';
  /** True exactly when every scheduler agrees. */
  safeToPort: boolean;
  /** The nonexistent or ambiguous firings the schedulers decide on. */
  decisionPoints: DecisionPoint[];
  /** One column per scheduler policy. */
  columns: VerdictPolicyColumn[];
  /** Pairwise agree, differ, or undetermined relations. */
  pairs: PolicyPair[];
}

/** Inputs to the verdict builder. */
export interface VerdictInput {
  /** Source expression, used verbatim in the hazard id and output. */
  expression: string;
  /** Dialect the expression was parsed under. */
  dialect: DialectId;
  /** IANA zone to evaluate in. */
  zone: string;
  /** Inclusive lower bound as naive wall-clock fields. */
  from: LocalFiring;
  /** Exclusive upper bound as naive wall-clock fields. */
  to: LocalFiring;
  /** Whether a double execution is harmless; defaults to false. */
  idempotent?: boolean;
  /**
   * Zoneinfo root for ZONE_UNSTABLE (footer-extrapolation) detection.
   * The browser has no compiled table and passes nothing, so that one
   * hazard class is unavailable in single-backend mode.
   */
  zoneinfoRoot?: string;
}

/** The structured verdict: hazards, a severity tally, and the differential. */
export interface Verdict {
  /** Classified hazards as render rows, in the classifier's order. */
  hazards: HazardView[];
  /** Number of hazards. */
  hazardCount: number;
  /** Count of hazards per severity, in first-seen order. */
  bySeverity: Record<string, number>;
  /** The scheduler policy differential. */
  differential: VerdictDifferential;
}

/** The raw classifier and differential output before it is shaped for output. */
export interface RawVerdict {
  /** Classified hazards, in the classifier's order. */
  hazards: Hazard[];
  /** The full scheduler differential report. */
  report: DifferentialReport;
}

/**
 * Runs the classifier and the scheduler differential once. The CLI uses
 * the raw hazards and report to render its human tables, then calls
 * {@link verdictData} to shape the same computation for output.
 */
export function classifyForVerdict(
  ast: CronAst,
  backend: TzBackend,
  input: VerdictInput,
): RawVerdict {
  const classifyInput = {
    expression: input.expression,
    dialect: input.dialect,
    zone: input.zone,
    from: input.from,
    to: input.to,
    ...(input.idempotent === undefined ? {} : { idempotent: input.idempotent }),
    ...(input.zoneinfoRoot === undefined ? {} : { zoneinfoRoot: input.zoneinfoRoot }),
  };
  const hazards = classifyHazards(ast, backend, classifyInput);
  const report = runDifferential({
    ast,
    expression: input.expression,
    dialect: input.dialect,
    zone: input.zone,
    from: input.from,
    to: input.to,
    backend,
  });
  return { hazards, report };
}

/** Shapes raw classifier and differential output into the verdict payload. */
export function verdictData(hazards: Hazard[], report: DifferentialReport): Verdict {
  const bySeverity: Record<string, number> = {};
  for (const hazard of hazards) {
    bySeverity[hazard.severity] = (bySeverity[hazard.severity] ?? 0) + 1;
  }
  const differential: VerdictDifferential = {
    verdict: report.verdict,
    safeToPort: report.safeToPort,
    decisionPoints: report.decisionPoints,
    columns: report.columns.map((column) => ({
      policyId: column.policyId,
      verification: column.verification,
      outcomes: column.cells.map((cell) => ({
        kind: cell.outcomeKind,
        instants: cell.instants.map(isoUtc),
      })),
    })),
    pairs: report.pairs,
  };
  return {
    hazards: hazards.map(hazardToView),
    hazardCount: hazards.length,
    bySeverity,
    differential,
  };
}

/**
 * Builds the verdict for a parsed schedule against one backend and
 * window in one call. The ast must already be parsed under
 * `input.dialect`. Throws only if the classifier itself throws (for
 * example an unreadable zone in the TZif backend); callers handle parse
 * errors before this point.
 */
export function buildVerdict(ast: CronAst, backend: TzBackend, input: VerdictInput): Verdict {
  const { hazards, report } = classifyForVerdict(ast, backend, input);
  return verdictData(hazards, report);
}
