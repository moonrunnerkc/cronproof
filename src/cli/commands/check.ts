/**
 * `cronproof check`: classify the timezone hazards of one expression
 * in one zone over a window, and run the scheduler policy differential
 * so the output shows both the DST hazards and the portability
 * hazards (where real schedulers disagree).
 */

import type { Hazard } from '../../hazard/index';
import { parse, type LocalFiring } from '../../cron/index';
import type { DifferentialReport, PolicyCell } from '../../policy/index';
import { classifyForVerdict, verdictData } from '../../analyze/index';
import type { ParsedArgs } from '../args';
import { internalVerification, isoUtc, makeBackend, resolveRoot } from '../analyze';
import type { ResultModel, Section } from '../types';

function cellText(cell: PolicyCell): string {
  if (cell.undefinedOutcome) {
    return '?';
  }
  return String(cell.instants.length);
}

function differentialSections(report: DifferentialReport): Section[] {
  const columns = report.columns.map((column) => column.policyId);
  const rows = report.decisionPoints.map((point, index) => {
    const cells = report.columns.map((column) => {
      const cell = column.cells[index];
      return cell === undefined ? '·' : cellText(cell);
    });
    return [`${point.intendedLocal.hour}:${String(point.intendedLocal.minute).padStart(2, '0')} ${point.resolutionKind}`, ...cells];
  });
  const differ = report.pairs.filter((pair) => pair.relation === 'differ').map((pair) => `${pair.a} vs ${pair.b}`);
  const sections: Section[] = [];
  if (rows.length > 0) {
    sections.push({ heading: 'policy differential (fire count per decision point)', kind: 'table', columns: ['decision point', ...columns], rows });
  }
  sections.push({
    heading: 'portability verdict',
    kind: 'keyval',
    pairs: [
      ['verdict', report.verdict],
      ['safe to port', String(report.safeToPort)],
      ['definite disagreements', differ.length === 0 ? 'none' : differ.join('; ')],
    ],
  });
  return sections;
}

function localLabel(local: Hazard['intendedLocal']): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${local.year}-${p(local.month)}-${p(local.day)} ${p(local.hour)}:${p(local.minute)}`;
}

function hazardSection(hazards: Hazard[]): Section {
  if (hazards.length === 0) {
    return { heading: 'hazards', kind: 'text', lines: ['none'] };
  }
  return {
    heading: 'hazards',
    kind: 'table',
    columns: ['severity', 'kind', 'local time', 'instants (UTC)', 'id'],
    rows: hazards.map((hazard) => [
      hazard.severity,
      hazard.kind,
      localLabel(hazard.intendedLocal),
      hazard.instants.map(isoUtc).join(', ') || '(none)',
      hazard.id,
    ]),
  };
}

/** Builds the check result, or a usage error. */
export function runCheck(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null) {
    return { usageError: 'check needs an expression: cronproof check "<expr>" --tz <zone> --from <date> --to <date>' };
  }
  if (args.zone === null || args.from === null || args.to === null) {
    return { usageError: 'check needs --tz, --from and --to' };
  }
  const parsed = parse(args.positional, args.dialect);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    return { usageError: `parse error at offset ${first?.offset ?? 0}: ${first?.reason ?? 'invalid expression'}` };
  }

  const root = resolveRoot(args.zoneinfoRoot);
  const backend = makeBackend(root);
  const inputs: [string, string][] = [
    ['command', 'check'],
    ['expression', args.positional],
    ['dialect', args.dialect],
    ['zone', args.zone],
    ['from', args.from.text],
    ['to', args.to.text],
    ['idempotent', String(args.idempotent)],
  ];
  const title = `check ${args.positional} [${args.dialect}] in ${args.zone}`;

  const failure = internalVerification(backend, args.zone, args.from.fields, args.to.fields, root);
  if (failure !== null) {
    return {
      model: {
        command: 'check',
        title,
        inputs,
        hazards: [],
        sections: [{ heading: 'internal verification failed', kind: 'text', lines: [failure] }],
        data: { verificationFailure: failure },
        baseExit: 3,
      },
    };
  }

  const from: LocalFiring = { ...args.from.fields };
  const to: LocalFiring = { ...args.to.fields };
  let hazards: Hazard[];
  let differential: DifferentialReport;
  try {
    const raw = classifyForVerdict(parsed.ast, backend, {
      expression: args.positional,
      dialect: args.dialect,
      zone: args.zone,
      from,
      to,
      idempotent: args.idempotent,
      zoneinfoRoot: root,
    });
    hazards = raw.hazards;
    differential = raw.report;
  } catch (error) {
    return { usageError: `cannot analyze: ${error instanceof Error ? error.message : String(error)}` };
  }

  const verdict = verdictData(hazards, differential);

  return {
    model: {
      command: 'check',
      title,
      inputs,
      hazards: verdict.hazards,
      sections: [hazardSection(hazards), ...differentialSections(differential)],
      data: {
        expression: args.positional,
        dialect: args.dialect,
        zone: args.zone,
        window: { from: args.from.text, to: args.to.text },
        hazardCount: verdict.hazardCount,
        bySeverity: verdict.bySeverity,
        hazards: verdict.hazards,
        differential: verdict.differential,
      },
      baseExit: 0,
    },
  };
}
