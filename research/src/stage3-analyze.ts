/**
 * Stage 3, analyze. Runs the real cronproof scanner and classifier over
 * every corpus file: it extracts each schedule with its zone, parses
 * the expression, classifies the timezone hazards over the pinned
 * window, and runs the k8s-cronjob against debian-cron policy
 * differential so the report can measure how often the two fire a
 * different number of times. The output is out/analysis.jsonl, one row
 * per extracted schedule, deterministic given the corpus and blobs.
 */

import path from 'node:path';
import { parse, type DialectId } from '../../src/cron/index';
import { classifyHazards } from '../../src/hazard/index';
import { runDifferential } from '../../src/policy/index';
import { scannersFor, type ScheduleFinding } from '../../src/scan/index';
import {
  createTzifBackend,
  vendoredZoneinfoRoot,
  type TzifBackend,
} from '../../src/tz/index';
import { OUT_DIR, WINDOW_FROM, WINDOW_TO } from './config';
import { readBlob, writeJsonl } from './cache';
import { readCorpus } from './stage2-filter';
import type { AnalyzedSchedule, CorpusRow } from './types';

/** Path of the per-schedule analysis this stage produces. */
export const ANALYSIS_FILE = path.join(OUT_DIR, 'analysis.jsonl');

/** Hazard kinds that mean a firing interacts with a transition window. */
const TRANSITION_KINDS = new Set(['SKIPPED', 'DOUBLED', 'INTERVAL_DRIFT', 'COUNT_ANOMALY']);

function zoneOf(finding: ScheduleFinding): { zone: string | null; kind: string } {
  const source = finding.zoneSource;
  if (source.kind === 'unknown') {
    return { zone: null, kind: 'unknown' };
  }
  return { zone: source.zone, kind: source.kind };
}

/** Resolves the vendored zoneinfo root lazily, throwing when absent. */
function resolveRoot(): string {
  const root = vendoredZoneinfoRoot();
  if (root === null) {
    throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
  }
  return root;
}

function analyzeFinding(
  finding: ScheduleFinding,
  row: CorpusRow,
  tz: TzifBackend,
  root: string,
): AnalyzedSchedule {
  const { zone, kind: zoneSourceKind } = zoneOf(finding);
  const base: AnalyzedSchedule = {
    repo: row.repo,
    path: row.path,
    sha: row.sha,
    sourceKind: finding.sourceKind,
    dialect: finding.dialect,
    expression: finding.expression,
    zone,
    zoneSourceKind,
    parsed: false,
    zoneResolvable: false,
    hazardKinds: [],
    firesInTransitionWindow: false,
    k8sFiringCount: null,
    debianFiringCount: null,
  };
  if (finding.expression === null || finding.dialect === null || zone === null) {
    return base;
  }
  const parsed = parse(finding.expression, finding.dialect as DialectId);
  if (!parsed.ok) {
    return base;
  }

  // The zone came from source text and may not be a loadable IANA name.
  // Any engine failure (an unknown zone, an unreadable table) makes the
  // schedule not analyzable rather than aborting the whole corpus run.
  try {
    const hazards = classifyHazards(parsed.ast, tz, {
      expression: finding.expression,
      dialect: finding.dialect as DialectId,
      zone,
      from: WINDOW_FROM,
      to: WINDOW_TO,
      zoneinfoRoot: root,
    });
    const hazardKinds = [...new Set(hazards.map((hazard) => hazard.kind))].sort();

    const differential = runDifferential({
      ast: parsed.ast,
      expression: finding.expression,
      dialect: finding.dialect as DialectId,
      zone,
      from: WINDOW_FROM,
      to: WINDOW_TO,
      backend: tz,
      policyIds: ['k8s-cronjob', 'debian-cron'],
    });
    const k8s = differential.columns.find((column) => column.policyId === 'k8s-cronjob');
    const debian = differential.columns.find((column) => column.policyId === 'debian-cron');

    return {
      ...base,
      parsed: true,
      zoneResolvable: true,
      hazardKinds,
      firesInTransitionWindow: hazardKinds.some((kind) => TRANSITION_KINDS.has(kind)),
      k8sFiringCount: k8s?.hazardFiringCount ?? null,
      debianFiringCount: debian?.hazardFiringCount ?? null,
    };
  } catch {
    return { ...base, parsed: true, zoneResolvable: false };
  }
}

/**
 * Analyzes every corpus row and writes out/analysis.jsonl. Files that
 * yield no schedule (a query false positive) contribute nothing.
 * @returns One record per schedule found in the corpus.
 * @throws Error when the corpus is non-empty but no file content is
 * cached, which means the cache is gone rather than the corpus empty.
 */
export function analyze(): AnalyzedSchedule[] {
  const root = resolveRoot();
  const tz = createTzifBackend({ zoneinfoRoot: root });
  const rows = readCorpus();
  const results: AnalyzedSchedule[] = [];
  let readable = 0;
  for (const row of rows) {
    const text = readBlob(row.sha);
    if (text === null) {
      continue;
    }
    readable += 1;
    const file = { path: row.path, absPath: row.path, text };
    for (const scanner of scannersFor(file)) {
      for (const finding of scanner(file)) {
        results.push(analyzeFinding(finding, row, tz, root));
      }
    }
  }
  if (rows.length > 0 && readable === 0) {
    throw new Error(
      `the corpus lists ${rows.length} files but no content is cached, so analyze would ` +
        `overwrite ${ANALYSIS_FILE} with an empty analysis. The cache is not committed; ` +
        `run "pnpm run research collect" to rebuild it from the manifest, or rerun only "report".`,
    );
  }
  writeJsonl(ANALYSIS_FILE, results);
  process.stderr.write(`[analyze] ${results.length} schedules from ${rows.length} corpus files\n`);
  return results;
}
