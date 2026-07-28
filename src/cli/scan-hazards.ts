/**
 * Bridges the repository scanner to the timezone hazard classifier.
 * Each discovered schedule with a real zone and a parseable expression
 * is classified over a window, and the resulting hazards carry the
 * finding's physical file, line, and column so a SARIF annotation lands
 * on the exact source line in a pull request.
 *
 * Two discovery hazards are surfaced that are not DST classifications:
 * a schedule whose zone is UNKNOWN cannot be proven safe, and one whose
 * expression is UNRESOLVED (a template) cannot be verified at all. Both
 * are reported so the CI gate sees them, at medium severity.
 */

import { createHash } from 'node:crypto';
import { parse, type LocalFiring } from '../cron/index';
import { classifyHazards, type Hazard } from '../hazard/index';
import { describeZoneSource, type ScheduleFinding } from '../scan/index';
import type { TzifBackend } from '../tz/index';
import { hazardToView } from './analyze';
import type { HazardLocation, HazardView } from './types';

/** The wall-clock window a scan classifies its findings over. */
export interface ScanWindow {
  /** Inclusive lower bound. */
  from: LocalFiring;
  /** Exclusive upper bound. */
  to: LocalFiring;
}

function locationOf(finding: ScheduleFinding): HazardLocation {
  return { file: finding.file, line: finding.line, column: finding.column };
}

/** Stable id for a discovery hazard, independent of the line it sits on. */
function discoveryId(kind: string, file: string, marker: string): string {
  const digest = createHash('sha256').update(`${kind} ${file} ${marker}`, 'utf8').digest('hex');
  return `hz_${digest.slice(0, 16)}`;
}

function discoveryHazard(finding: ScheduleFinding): HazardView | null {
  if (finding.resolution === 'unresolved') {
    return {
      id: discoveryId('UNRESOLVED', finding.file, String(finding.line)),
      kind: 'UNRESOLVED',
      severity: 'medium',
      zone: describeZoneSource(finding.zoneSource).zone,
      expression: 'UNRESOLVED',
      localIso: '',
      instantsUtc: [],
      message: 'schedule value is an unresolved template; it cannot be verified until it is expanded',
      location: locationOf(finding),
    };
  }
  if (finding.zoneSource.kind === 'unknown') {
    return {
      id: discoveryId('ZONE_UNKNOWN', finding.file, finding.expression ?? ''),
      kind: 'ZONE_UNKNOWN',
      severity: 'medium',
      zone: 'UNKNOWN',
      expression: finding.expression ?? '',
      localIso: '',
      instantsUtc: [],
      message: 'timezone cannot be determined from source; this schedule cannot be proven safe',
      location: locationOf(finding),
    };
  }
  return null;
}

function classifyOne(
  finding: ScheduleFinding,
  backend: TzifBackend,
  window: ScanWindow,
  root: string,
  idempotent: boolean,
): HazardView[] {
  const zone = describeZoneSource(finding.zoneSource).zone;
  const expression = finding.expression;
  if (expression === null) {
    return [];
  }
  const parsed = parse(expression, finding.dialect ?? 'vixie');
  if (!parsed.ok) {
    return [];
  }
  let hazards: Hazard[];
  try {
    hazards = classifyHazards(parsed.ast, backend, {
      expression,
      dialect: finding.dialect ?? 'vixie',
      zone,
      from: window.from,
      to: window.to,
      idempotent,
      zoneinfoRoot: root,
    });
  } catch {
    // A zone the tzdb does not know, or an expression the classifier
    // cannot evaluate, is skipped rather than crashing the whole scan.
    return [];
  }
  return hazards.map((hazard) => ({ ...hazardToView(hazard), location: locationOf(finding) }));
}

/**
 * Classifies every finding into zero or more hazard views.
 * @param findings The scanner's findings.
 * @param backend Timezone backend for classification.
 * @param window Wall-clock window to classify over.
 * @param root Zoneinfo root for ZONE_UNSTABLE detection.
 * @param idempotent Whether double runs are harmless (lowers DOUBLED).
 * @returns Hazard views, each carrying the finding's physical location.
 */
export function hazardsFromFindings(
  findings: ScheduleFinding[],
  backend: TzifBackend,
  window: ScanWindow,
  root: string,
  idempotent: boolean,
): HazardView[] {
  const out: HazardView[] = [];
  for (const finding of findings) {
    const discovery = discoveryHazard(finding);
    if (discovery !== null) {
      out.push(discovery);
      continue;
    }
    out.push(...classifyOne(finding, backend, window, root, idempotent));
  }
  return out;
}
