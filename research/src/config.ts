/**
 * Pipeline configuration: the search queries, the collection caps, the
 * pinned analysis window, and the on-disk layout. Every value that
 * shapes the corpus or the numbers lives here so the study is defined
 * in one place and a rerun uses the same knobs.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LocalFiring } from '../../src/cron/index';

/** Absolute path of the research/ directory. */
export const RESEARCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where raw GitHub responses and blobs are cached (stage 1 output). */
export const CACHE_DIR = path.join(RESEARCH_ROOT, 'cache');

/** Where the filtered corpus, analysis, and report are written. */
export const OUT_DIR = path.join(RESEARCH_ROOT, 'out');

/** One code-search query and the platform it targets. */
export interface Query {
  /** Stable id used in filenames and the manifest. */
  id: string;
  /** The GitHub code-search query string. */
  q: string;
}

/**
 * The four platform queries. Kept deliberately narrow (timezone-carrying
 * schedules) because those are the schedules a DST transition can bite;
 * a raw crontab with no zone is out of scope for the headline metric.
 */
export const QUERIES: Query[] = [
  { id: 'k8s-cronjob', q: 'timeZone schedule kind CronJob language:YAML' },
  { id: 'wrangler', q: 'crons filename:wrangler.toml' },
  { id: 'vercel', q: 'crons filename:vercel.json' },
  { id: 'crontab', q: 'CRON_TZ filename:crontab' },
];

/** Results requested per search page (GitHub caps this at 100). */
export const PER_PAGE = 100;

/**
 * Pages collected per query. GitHub code search exposes at most 1000
 * results (10 pages) and its ordering is not a uniform sample, so a
 * cap here is both a rate-limit and an honesty measure: the corpus is
 * an opportunistic snapshot, not a census. Recorded in the report.
 */
export const MAX_PAGES = 3;

/**
 * The pinned 12-month analysis window. The spec asks for "the next 12
 * months", but a window anchored to the wall clock would make the
 * report irreproducible. This fixed 2025 window is the operational
 * stand-in: it spans a full year of both-hemisphere DST transitions.
 * See DECISIONS.md, phase 12.
 */
export const WINDOW_FROM: LocalFiring = { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 };

/** Exclusive upper bound of the analysis window. */
export const WINDOW_TO: LocalFiring = { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 };

/** Human-readable label for the analysis window, printed in the report. */
export const WINDOW_LABEL = '2025-01-01 to 2026-01-01 (UTC wall-clock)';
