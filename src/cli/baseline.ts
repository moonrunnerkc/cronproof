/**
 * Baseline file handling. A baseline records the hazard ids that were
 * already present when a team adopted cronproof, so those known hazards
 * do not block the build and only newly introduced ones fail the gate.
 * Without this, no existing codebase can adopt the tool.
 *
 * The file is a small, sorted, timestamp-free JSON document so it is
 * stable in version control and reviewable in a diff. Hazard ids are
 * stable across runs and refactors (see hazard-id), which is what makes
 * a baseline meaningful over time.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type { HazardView } from './types';

/** The on-disk baseline shape. */
interface BaselineFile {
  /** Format version, for forward compatibility. */
  version: number;
  /** Sorted, de-duplicated accepted hazard ids. */
  baseline: string[];
}

/**
 * Reads a baseline file into a set of accepted hazard ids.
 * @param path Path to the baseline JSON file.
 * @returns The set of accepted hazard ids.
 * @throws Error when the file cannot be read or is not a valid baseline.
 */
export function readBaseline(path: string): Set<string> {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `cannot read baseline file ${path}: ${error instanceof Error ? error.message : String(error)}. ` +
        'Generate one with: cronproof baseline <path> --out <file>',
      { cause: error },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`baseline file ${path} is not valid JSON`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { baseline?: unknown }).baseline)
  ) {
    throw new Error(`baseline file ${path} is missing a "baseline" array of hazard ids`);
  }
  const ids = (parsed as { baseline: unknown[] }).baseline;
  const set = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string') {
      set.add(id);
    }
  }
  return set;
}

/**
 * Writes hazard ids to a baseline file, sorted and de-duplicated.
 * @param path Destination path.
 * @param ids Hazard ids to accept.
 * @returns The number of distinct ids written.
 */
export function writeBaseline(path: string, ids: string[]): number {
  const unique = [...new Set(ids)].sort();
  const document: BaselineFile = { version: 1, baseline: unique };
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return unique.length;
}

/** Hazards split into those not baselined (active) and those accepted. */
export interface BaselineSplit {
  /** Hazards whose id is not in the baseline; these still gate the build. */
  active: HazardView[];
  /** Hazards accepted by the baseline; reported but not gating. */
  baselined: HazardView[];
}

/**
 * Splits hazards against a baseline set.
 * @param hazards All hazards found this run.
 * @param baseline Accepted hazard ids.
 * @returns The active and baselined partitions.
 */
export function splitByBaseline(hazards: HazardView[], baseline: Set<string>): BaselineSplit {
  const active: HazardView[] = [];
  const baselined: HazardView[] = [];
  for (const hazard of hazards) {
    if (baseline.has(hazard.id)) {
      baselined.push(hazard);
    } else {
      active.push(hazard);
    }
  }
  return { active, baselined };
}
