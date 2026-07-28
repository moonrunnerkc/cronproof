/**
 * `cronproof explain`: a deep dive on one transition. Finds the
 * transition nearest --at, shows the gap or fold, the intended local
 * time the schedule wanted, and what each scheduler policy does with
 * it, formatted to paste straight into a bug report.
 */

import { classifyHazards, type Hazard } from '../../hazard/index';
import { parse } from '../../cron/index';
import { runDifferential } from '../../policy/index';
import { resolveWallClock } from '../../tz/index';
import type { ParsedArgs } from '../args';
import { hazardToView, isoUtc, makeBackend, resolveRoot } from '../analyze';
import type { ResultModel, Section } from '../types';

const DAY_MILLIS = 86_400_000;

function windowFields(millis: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const d = new Date(millis);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0, second: 0 };
}

/** Builds the explain result, or a usage error. */
export function runExplain(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null || args.zone === null || args.at === null) {
    return { usageError: 'explain needs an expression, --tz <zone> and --at <ISO instant>' };
  }
  const parsed = parse(args.positional, args.dialect);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    return { usageError: `parse error at offset ${first?.offset ?? 0}: ${first?.reason ?? 'invalid expression'}` };
  }
  const root = resolveRoot(args.zoneinfoRoot);
  const backend = makeBackend(root);
  const atMillis = args.at.utcMillis;

  const transitions = backend.transitionsBetween(atMillis - 5 * DAY_MILLIS, atMillis + 5 * DAY_MILLIS, args.zone);
  const nearest = transitions.reduce<null | (typeof transitions)[number]>((best, transition) => {
    if (best === null || Math.abs(transition.instant - atMillis) < Math.abs(best.instant - atMillis)) {
      return transition;
    }
    return best;
  }, null);

  const inputs: [string, string][] = [
    ['command', 'explain'],
    ['expression', args.positional],
    ['dialect', args.dialect],
    ['zone', args.zone],
    ['at', args.at.text],
  ];
  const title = `explain ${args.positional} in ${args.zone} near ${args.at.text}`;

  if (nearest === null) {
    return {
      model: {
        command: 'explain', title, inputs, hazards: [],
        sections: [{ heading: 'no transition', kind: 'text', lines: [`no offset transition within five days of ${args.at.text} in ${args.zone}`] }],
        data: { transition: null }, baseExit: 0,
      },
    };
  }

  const from = windowFields(nearest.instant - DAY_MILLIS);
  const to = windowFields(nearest.instant + DAY_MILLIS);
  const differential = runDifferential({ ast: parsed.ast, expression: args.positional, dialect: args.dialect, zone: args.zone, from, to, backend });
  const hazards: Hazard[] = classifyHazards(parsed.ast, backend, {
    expression: args.positional, dialect: args.dialect, zone: args.zone, from, to, zoneinfoRoot: root,
  });

  const transitionSection: Section = {
    heading: 'transition',
    kind: 'keyval',
    pairs: [
      ['instant (UTC)', isoUtc(nearest.instant)],
      ['offset before', `${nearest.offsetBeforeSeconds / 3600}h`],
      ['offset after', `${nearest.offsetAfterSeconds / 3600}h`],
      ['direction', nearest.deltaSeconds > 0 ? 'spring-forward (gap)' : 'fall-back (fold)'],
      ['shift', `${Math.abs(nearest.deltaSeconds) / 60}m`],
    ],
  };

  const sections: Section[] = [transitionSection];
  const policyColumns = differential.columns.map((column) => column.policyId);
  differential.decisionPoints.forEach((point, index) => {
    const resolution = resolveWallClock(point.intendedLocal, args.zone ?? '', backend);
    const kindLine =
      resolution.kind === 'nonexistent'
        ? `does not exist; gap of ${resolution.gapDurationMilliseconds / 60000}m`
        : resolution.kind === 'ambiguous'
          ? `occurs twice: ${isoUtc(resolution.earlierInstant)} and ${isoUtc(resolution.laterInstant)}`
          : 'unique';
    const rows = differential.columns.map((column) => {
      const cell = column.cells[index];
      const outcome = cell === undefined ? '·' : cell.undefinedOutcome ? 'UNDEFINED' : `${cell.outcomeKind} ${cell.instants.map(isoUtc).join(', ')}`.trim();
      return [`${column.policyId} (${column.verification})`, outcome];
    });
    sections.push({
      heading: `intended ${point.intendedLocal.hour}:${String(point.intendedLocal.minute).padStart(2, '0')} local (${kindLine})`,
      kind: 'table',
      columns: ['policy', 'what it does'],
      rows,
    });
  });
  if (differential.decisionPoints.length === 0) {
    sections.push({ heading: 'schedule', kind: 'text', lines: ['the schedule does not fire in the affected wall-clock window, so this transition does not perturb it'] });
  }

  return {
    model: {
      command: 'explain', title, inputs,
      hazards: hazards.map(hazardToView),
      sections,
      data: {
        transition: { instantUtc: isoUtc(nearest.instant), deltaSeconds: nearest.deltaSeconds, offsetBeforeSeconds: nearest.offsetBeforeSeconds, offsetAfterSeconds: nearest.offsetAfterSeconds },
        policies: policyColumns,
        decisionPoints: differential.decisionPoints.map((point, index) => ({
          intendedLocal: point.intendedLocal,
          resolutionKind: point.resolutionKind,
          outcomes: differential.columns.map((column) => ({ policyId: column.policyId, outcome: column.cells[index]?.outcomeKind ?? null, instants: (column.cells[index]?.instants ?? []).map(isoUtc) })),
        })),
        hazards: hazards.map(hazardToView),
      },
      baseExit: 0,
    },
  };
}
