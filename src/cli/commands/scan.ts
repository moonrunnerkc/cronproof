/**
 * `cronproof scan <path>`: walk a repository (or a single file), find
 * every schedule a supported platform understands, classify its
 * timezone hazards, and report each with a file, line, and column so a
 * SARIF annotation lands on the source line. A schedule whose zone is
 * UNKNOWN and one whose value is UNRESOLVED are surfaced as hazards in
 * their own right, because neither can be proven safe.
 *
 * With --baseline <file>, hazards whose id is in the baseline are
 * reported but do not gate the build, so an existing codebase adopts
 * the tool without its known hazards blocking every PR; a newly
 * introduced hazard still fails.
 */

import { describeZoneSource, type ScanResult, type ScheduleFinding } from '../../scan/index';
import type { ParsedArgs } from '../args';
import { readBaseline, splitByBaseline } from '../baseline';
import { analyzeScan } from '../scan-run';
import type { HazardView, ResultModel, Section } from '../types';

function location(finding: ScheduleFinding): string {
  return `${finding.file}:${finding.line}:${finding.column}`;
}

function hazardLocation(hazard: HazardView): string {
  const at = hazard.location;
  return at === undefined ? '(no location)' : `${at.file}:${at.line}:${at.column}`;
}

function findingRow(finding: ScheduleFinding): string[] {
  const zone = describeZoneSource(finding.zoneSource);
  const expression = finding.resolution === 'unresolved' ? 'UNRESOLVED' : (finding.expression ?? '');
  const notes = finding.warnings.length === 0 ? '' : finding.warnings.join('; ');
  return [location(finding), finding.sourceKind, expression, zone.zone, zone.source, notes];
}

function scheduleSection(findings: ScheduleFinding[]): Section {
  if (findings.length === 0) {
    return { heading: 'schedules', kind: 'text', lines: ['no schedules found'] };
  }
  return {
    heading: 'schedules',
    kind: 'table',
    columns: ['location', 'source', 'expression', 'zone', 'zone source', 'notes'],
    rows: findings.map(findingRow),
  };
}

function hazardSection(hazards: HazardView[], heading: string): Section {
  if (hazards.length === 0) {
    return { heading, kind: 'text', lines: ['none'] };
  }
  return {
    heading,
    kind: 'table',
    columns: ['severity', 'kind', 'location', 'zone', 'expression', 'id'],
    rows: hazards.map((hazard) => [
      hazard.severity,
      hazard.kind,
      hazardLocation(hazard),
      hazard.zone,
      hazard.expression,
      hazard.id,
    ]),
  };
}

function serializeHazard(hazard: HazardView): Record<string, unknown> {
  return {
    id: hazard.id,
    kind: hazard.kind,
    severity: hazard.severity,
    zone: hazard.zone,
    expression: hazard.expression,
    location: hazard.location ?? null,
    localIso: hazard.localIso,
    instantsUtc: hazard.instantsUtc,
    message: hazard.message,
  };
}

function serializeFinding(finding: ScheduleFinding): Record<string, unknown> {
  const zone = describeZoneSource(finding.zoneSource);
  return {
    file: finding.file,
    line: finding.line,
    column: finding.column,
    sourceKind: finding.sourceKind,
    dialect: finding.dialect,
    expression: finding.expression,
    resolution: finding.resolution,
    zone: zone.zone,
    zoneSource: finding.zoneSource,
    warnings: finding.warnings,
  };
}

function suppressedSection(result: ScanResult): Section | null {
  if (result.suppressed.length === 0) {
    return null;
  }
  return {
    heading: 'suppressed (valid reason given)',
    kind: 'table',
    columns: ['location', 'source', 'reason'],
    rows: result.suppressed.map((item) => [
      location(item.finding),
      item.finding.sourceKind,
      item.reason,
    ]),
  };
}

function diagnosticSection(result: ScanResult): Section | null {
  if (result.diagnostics.length === 0) {
    return null;
  }
  return {
    heading: 'diagnostics',
    kind: 'table',
    columns: ['location', 'code', 'message'],
    rows: result.diagnostics.map((diagnostic) => [
      `${diagnostic.file}:${diagnostic.line}`,
      diagnostic.code,
      diagnostic.message,
    ]),
  };
}

/** Builds the scan result, or a usage error. */
export function runScan(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null) {
    return { usageError: 'scan needs a path: cronproof scan <path>' };
  }
  let analysis: ReturnType<typeof analyzeScan>;
  try {
    analysis = analyzeScan(args.positional, args);
  } catch (error) {
    return { usageError: `cannot scan ${args.positional}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const { result } = analysis;

  let active = analysis.hazards;
  let baselined: HazardView[] = [];
  if (args.baseline !== null) {
    let ids: Set<string>;
    try {
      ids = readBaseline(args.baseline);
    } catch (error) {
      return { usageError: error instanceof Error ? error.message : String(error) };
    }
    const split = splitByBaseline(analysis.hazards, ids);
    active = split.active;
    baselined = split.baselined;
  }

  const bySeverity: Record<string, number> = {};
  for (const hazard of active) {
    bySeverity[hazard.severity] = (bySeverity[hazard.severity] ?? 0) + 1;
  }

  const sections: Section[] = [
    {
      heading: 'summary',
      kind: 'keyval',
      pairs: [
        ['files scanned', String(result.filesScanned)],
        ['schedules found', String(result.findings.length)],
        ['hazards (gating)', String(active.length)],
        ['hazards (baselined)', String(baselined.length)],
        ['suppressed', String(result.suppressed.length)],
        ['diagnostics', String(result.diagnostics.length)],
      ],
    },
    hazardSection(active, 'hazards'),
  ];
  if (baselined.length > 0) {
    sections.push(hazardSection(baselined, 'baselined (accepted, not gating)'));
  }
  sections.push(scheduleSection(result.findings));
  const suppressed = suppressedSection(result);
  if (suppressed !== null) {
    sections.push(suppressed);
  }
  const diagnostics = diagnosticSection(result);
  if (diagnostics !== null) {
    sections.push(diagnostics);
  }

  const inputs: [string, string][] = [
    ['command', 'scan'],
    ['path', args.positional],
    ['window', `${fmt(analysis.window.from)}..${fmt(analysis.window.to)}`],
  ];
  if (args.baseline !== null) {
    inputs.push(['baseline', args.baseline]);
  }

  return {
    model: {
      command: 'scan',
      title: `scan ${args.positional}`,
      inputs,
      hazards: active,
      sections,
      data: {
        path: args.positional,
        filesScanned: result.filesScanned,
        counts: {
          findings: result.findings.length,
          hazards: active.length,
          baselined: baselined.length,
          bySeverity,
          suppressed: result.suppressed.length,
          diagnostics: result.diagnostics.length,
        },
        hazards: active.map(serializeHazard),
        baselined: baselined.map(serializeHazard),
        findings: result.findings.map(serializeFinding),
        suppressed: result.suppressed.map((item) => ({
          finding: serializeFinding(item.finding),
          reason: item.reason,
          atLine: item.atLine,
        })),
        diagnostics: result.diagnostics,
      },
      baseExit: 0,
    },
  };
}

function fmt(local: { year: number; month: number; day: number }): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${local.year}-${p(local.month)}-${p(local.day)}`;
}
