/**
 * Shared scan analysis used by both the scan and baseline commands:
 * walk the tree, classify each finding's hazards over a window, and
 * return the findings plus a stably ordered hazard list. Keeping this
 * in one place means `baseline` records exactly the ids that `scan`
 * would later gate on.
 */

import { scanRepo, type ScanResult } from '../scan/index';
import type { LocalFiring } from '../cron/index';
import type { ParsedArgs } from './args';
import { makeBackend, resolveRoot, severityOrder } from './analyze';
import { hazardsFromFindings, type ScanWindow } from './scan-hazards';
import type { HazardView } from './types';

const midnight = (year: number, month: number, day: number): LocalFiring => ({
  year,
  month,
  day,
  hour: 0,
  minute: 0,
  second: 0,
});

/**
 * Default classification window when none is given: two years chosen to
 * span several spring-forward and fall-back transitions so DST hazards
 * are actually reached. Fixed dates keep scan output reproducible.
 */
export const DEFAULT_SCAN_WINDOW: ScanWindow = {
  from: midnight(2025, 1, 1),
  to: midnight(2027, 1, 1),
};

function windowFrom(args: ParsedArgs): ScanWindow {
  if (args.from !== null && args.to !== null) {
    return { from: args.from.fields, to: args.to.fields };
  }
  if (args.hazardWindow !== null) {
    return { from: args.hazardWindow.from.fields, to: args.hazardWindow.to.fields };
  }
  return DEFAULT_SCAN_WINDOW;
}

/** The result of scanning and classifying a tree. */
export interface ScanAnalysis {
  /** The raw scan result (findings, suppressed, diagnostics). */
  result: ScanResult;
  /** All hazards, stably ordered, before any baseline is applied. */
  hazards: HazardView[];
  /** The window classification ran over. */
  window: ScanWindow;
}

function order(a: HazardView, b: HazardView): number {
  const fa = a.location?.file ?? '';
  const fb = b.location?.file ?? '';
  return (
    fa.localeCompare(fb) ||
    (a.location?.line ?? 0) - (b.location?.line ?? 0) ||
    (a.location?.column ?? 0) - (b.location?.column ?? 0) ||
    severityOrder(b.severity) - severityOrder(a.severity) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Scans a path and classifies every finding into hazards.
 * @param path Directory or file to scan.
 * @param args Parsed CLI arguments (window, zoneinfo root, idempotent).
 * @returns The scan result and the ordered hazard list.
 * @throws Error when the path does not exist.
 */
export function analyzeScan(path: string, args: ParsedArgs): ScanAnalysis {
  const result = scanRepo(path);
  const root = resolveRoot(args.zoneinfoRoot);
  const backend = makeBackend(root);
  const window = windowFrom(args);
  const hazards = hazardsFromFindings(result.findings, backend, window, root, args.idempotent);
  hazards.sort(order);
  return { result, hazards, window };
}
