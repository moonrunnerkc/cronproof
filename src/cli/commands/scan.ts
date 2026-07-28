/**
 * `cronproof scan <path>`: walk a repository (or a single file), find
 * every schedule a supported platform understands, and report each with
 * its file, line, and column plus where its timezone came from. A
 * schedule whose zone is UNKNOWN and one whose value is UNRESOLVED (a
 * Helm template, a Spring placeholder) are both surfaced rather than
 * guessed at, because neither can be proven safe.
 */

import { describeZoneSource, scanRepo, type ScanResult, type ScheduleFinding } from '../../scan/index';
import type { ParsedArgs } from '../args';
import type { ResultModel, Section } from '../types';

function location(finding: ScheduleFinding): string {
  return `${finding.file}:${finding.line}:${finding.column}`;
}

function findingRow(finding: ScheduleFinding): string[] {
  const zone = describeZoneSource(finding.zoneSource);
  const expression = finding.resolution === 'unresolved' ? 'UNRESOLVED' : (finding.expression ?? '');
  const notes = finding.warnings.length === 0 ? '' : finding.warnings.join('; ');
  return [location(finding), finding.sourceKind, expression, zone.zone, zone.source, notes];
}

function findingSection(findings: ScheduleFinding[]): Section {
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

/** Builds the scan result, or a usage error. */
export function runScan(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null) {
    return { usageError: 'scan needs a path: cronproof scan <path>' };
  }
  let result: ScanResult;
  try {
    result = scanRepo(args.positional);
  } catch (error) {
    return { usageError: `cannot scan ${args.positional}: ${error instanceof Error ? error.message : String(error)}` };
  }

  const unresolved = result.findings.filter((finding) => finding.resolution === 'unresolved').length;
  const unknownZone = result.findings.filter((finding) => finding.zoneSource.kind === 'unknown').length;
  const sections: Section[] = [
    {
      heading: 'summary',
      kind: 'keyval',
      pairs: [
        ['files scanned', String(result.filesScanned)],
        ['schedules found', String(result.findings.length)],
        ['unresolved', String(unresolved)],
        ['unknown zone', String(unknownZone)],
        ['suppressed', String(result.suppressed.length)],
        ['diagnostics', String(result.diagnostics.length)],
      ],
    },
    findingSection(result.findings),
  ];
  const suppressed = suppressedSection(result);
  if (suppressed !== null) {
    sections.push(suppressed);
  }
  const diagnostics = diagnosticSection(result);
  if (diagnostics !== null) {
    sections.push(diagnostics);
  }

  return {
    model: {
      command: 'scan',
      title: `scan ${args.positional}`,
      inputs: [
        ['command', 'scan'],
        ['path', args.positional],
      ],
      hazards: [],
      sections,
      data: {
        path: args.positional,
        filesScanned: result.filesScanned,
        counts: {
          findings: result.findings.length,
          unresolved,
          unknownZone,
          suppressed: result.suppressed.length,
          diagnostics: result.diagnostics.length,
        },
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
