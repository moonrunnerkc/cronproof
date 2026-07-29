/**
 * Stage 2, filter. Turns the collected hits into the published corpus
 * by removing what would inflate a hazard rate artificially. Rules are
 * applied in a fixed order (vendored, library or fixture, fork, then
 * duplicate content) so each exclusion is attributed to exactly one
 * rule, and the count removed by each is recorded. The surviving rows
 * are the corpus manifest: repo, path, sha, and content hash, enough
 * for anyone to reconstruct the exact set.
 */

import path from 'node:path';
import { OUT_DIR } from './config';
import { readJsonl, writeJson, writeJsonl } from './cache';
import { hasCollected, readCollected, HITS_FILE } from './stage1-collect';
import type { CollectedHit, CorpusRow } from './types';

/** Path of the published corpus manifest. */
export const CORPUS_FILE = path.join(OUT_DIR, 'corpus.jsonl');

/** Path of the per-rule exclusion counts. */
export const EXCLUSIONS_FILE = path.join(OUT_DIR, 'exclusions.json');

const VENDORED = /(^|\/)(vendor|vendored|node_modules|third_party|third-party|bower_components|\.terraform)\//i;
const FIXTURE_PATH = /(^|\/)(testdata|fixtures?|__fixtures__|test-fixtures|golden)(\/|$)/i;
const LIBRARY_REPO = /(cron-parser|node-cron|croniter|cronsim|robfig\/cron|supercronic|cronexpr|cron-expression|crontab-parser|node-schedule|cronstrue)/i;

/** One exclusion rule: an id, a human description, and a predicate. */
interface Rule {
  id: string;
  description: string;
  excludes: (hit: CollectedHit) => boolean;
}

const RULES: Rule[] = [
  {
    id: 'vendored',
    description: 'file sits under a vendored dependency directory (vendor, node_modules, third_party, and similar)',
    excludes: (hit) => VENDORED.test(hit.path),
  },
  {
    id: 'library-or-fixture',
    description: 'file is a cron-library repository or lives in a test-fixture directory (testdata, fixtures, golden)',
    excludes: (hit) => LIBRARY_REPO.test(hit.repo) || FIXTURE_PATH.test(hit.path),
  },
  {
    id: 'fork',
    description: 'repository is a fork, so its schedule is almost always a copy of an upstream already counted',
    excludes: (hit) => hit.fork,
  },
];

/** The corpus after filtering, plus the per-rule exclusion tally. */
export interface FilterResult {
  /** Number of collected hits before any exclusion. */
  collected: number;
  /** Surviving corpus rows, sorted deterministically. */
  rows: CorpusRow[];
  /** Count removed by each rule id, in rule order, then 'duplicate'. */
  excluded: { rule: string; description: string; count: number }[];
}

function sortHits(hits: CollectedHit[]): CollectedHit[] {
  return [...hits].sort(
    (a, b) => a.repo.localeCompare(b.repo) || a.path.localeCompare(b.path) || a.sha.localeCompare(b.sha),
  );
}

/**
 * Applies the exclusion rules and content dedup to collected hits, pure
 * and IO-free. Rules run in a fixed order so each exclusion is charged
 * to exactly one rule; content dedup runs last on the survivors. Same
 * input always yields the same corpus and the same counts.
 */
export function applyFilter(input: CollectedHit[]): FilterResult {
  const hits = sortHits(input);
  const counts = new Map<string, number>();
  for (const rule of RULES) {
    counts.set(rule.id, 0);
  }
  counts.set('duplicate', 0);

  const rows: CorpusRow[] = [];
  const seenContent = new Set<string>();
  for (const hit of hits) {
    const rule = RULES.find((candidate) => candidate.excludes(hit));
    if (rule !== undefined) {
      counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
      continue;
    }
    if (seenContent.has(hit.contentHash)) {
      counts.set('duplicate', (counts.get('duplicate') ?? 0) + 1);
      continue;
    }
    seenContent.add(hit.contentHash);
    rows.push({
      repo: hit.repo,
      path: hit.path,
      sha: hit.sha,
      contentHash: hit.contentHash,
      query: hit.query,
      license: hit.license,
    });
  }

  const excluded = [
    ...RULES.map((rule) => ({ rule: rule.id, description: rule.description, count: counts.get(rule.id) ?? 0 })),
    {
      rule: 'duplicate',
      description: 'identical file content (same sha256) as a row already kept',
      count: counts.get('duplicate') ?? 0,
    },
  ];
  return { collected: hits.length, rows, excluded };
}

/**
 * Reads the collected hits, applies the filter, and writes the corpus
 * manifest and the exclusion counts. Deterministic given the cache.
 * @returns The corpus rows and the per-rule exclusion tally.
 * @throws Error when the cache is absent, rather than overwriting the
 * published manifest in out/ with an empty one.
 */
export function filter(): FilterResult {
  if (!hasCollected()) {
    throw new Error(
      `no collected hits at ${HITS_FILE}: the cache is not committed, so filter has nothing to ` +
        `recompute from and would overwrite ${CORPUS_FILE} with an empty corpus. ` +
        `Run "pnpm run research collect" first (it needs a GitHub token), or leave the ` +
        `published out/ files alone and rerun only "report".`,
    );
  }
  const result = applyFilter(readCollected());
  writeJsonl(CORPUS_FILE, result.rows);
  writeJson(EXCLUSIONS_FILE, {
    collected: result.collected,
    kept: result.rows.length,
    excluded: result.excluded,
  });
  return result;
}

/** Reads the corpus manifest written by {@link filter}. */
export function readCorpus(): CorpusRow[] {
  return readJsonl<CorpusRow>(CORPUS_FILE);
}
