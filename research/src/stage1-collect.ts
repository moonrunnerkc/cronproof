/**
 * Stage 1, collect. Runs each code-search query, pages through results
 * up to the cap, and for every hit caches the raw search page, the file
 * content (keyed by its git blob sha), and the repository metadata. The
 * output is cache/hits.jsonl: one record per unique (repo, path, sha)
 * with its content hash, license, fork status, and fetch timestamp.
 *
 * The stage is idempotent. A cached search page, blob, or repo record
 * is reused without a network call, and a prior fetch timestamp is
 * preserved, so a rerun from a warm cache touches the network zero
 * times and reproduces the same index.
 */

import path from 'node:path';
import { sha256Hex } from '../../src/hazard/index';
import { CACHE_DIR, MAX_PAGES, PER_PAGE, QUERIES } from './config';
import {
  cachedSearchPages,
  ensureCacheDirs,
  hasBlob,
  readBlob,
  readJson,
  readJsonl,
  readRepoMeta,
  searchPagePath,
  writeBlob,
  writeJson,
  writeJsonl,
  writeRepoMeta,
} from './cache';
import { fileContent, repoMeta, searchCode } from './github-client';
import type { CollectedHit, RepoMeta, SearchHit } from './types';

/** Path of the collected-hits index this stage produces. */
export const HITS_FILE = path.join(CACHE_DIR, 'hits.jsonl');

function hitKey(hit: { repo: string; path: string; sha: string }): string {
  return `${hit.repo}|${hit.path}|${hit.sha}`;
}

async function pageHits(queryId: string, q: string, page: number, refresh: boolean): Promise<SearchHit[]> {
  const file = searchPagePath(queryId, page);
  if (!refresh) {
    const cached = readJson<SearchHit[]>(file);
    if (cached !== null) {
      return cached;
    }
  }
  const hits = await searchCode(queryId, q, page);
  writeJson(file, hits);
  return hits;
}

async function searchHits(refresh: boolean): Promise<SearchHit[]> {
  const all: SearchHit[] = [];
  for (const query of QUERIES) {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const hits = await pageHits(query.id, query.q, page, refresh);
      all.push(...hits);
      if (hits.length < PER_PAGE) {
        break;
      }
    }
  }
  return all;
}

async function metaFor(repo: string, cache: Map<string, RepoMeta>): Promise<RepoMeta> {
  const inMemory = cache.get(repo);
  if (inMemory !== undefined) {
    return inMemory;
  }
  const cached = readRepoMeta<RepoMeta>(repo);
  const meta = cached ?? (await repoMeta(repo));
  if (cached === null) {
    writeRepoMeta(repo, meta);
  }
  cache.set(repo, meta);
  return meta;
}

async function contentFor(hit: SearchHit): Promise<string | null> {
  const cached = readBlob(hit.sha);
  if (cached !== null) {
    return cached;
  }
  const text = await fileContent(hit.repo, hit.sha);
  if (text === null) {
    return null;
  }
  writeBlob(hit.sha, text);
  return text;
}

/**
 * Collects the corpus into cache/hits.jsonl and returns the records.
 * When `refresh` is false, cached artifacts are reused and the network
 * is only touched for hits not yet cached.
 */
export async function collect(refresh: boolean): Promise<CollectedHit[]> {
  ensureCacheDirs();
  const priorTimestamps = new Map<string, string>();
  for (const prior of readJsonl<CollectedHit>(HITS_FILE)) {
    priorTimestamps.set(hitKey(prior), prior.fetchedAt);
  }

  const hits = await searchHits(refresh);
  const metaCache = new Map<string, RepoMeta>();
  const collected: CollectedHit[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const key = hitKey(hit);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const alreadyCached = hasBlob(hit.sha);
    const text = await contentFor(hit);
    if (text === null) {
      continue;
    }
    const meta = await metaFor(hit.repo, metaCache);
    const priorTime = priorTimestamps.get(key);
    const fetchedAt = priorTime ?? (alreadyCached ? 'cached-before-index' : new Date().toISOString());
    collected.push({
      query: hit.query,
      repo: hit.repo,
      path: hit.path,
      sha: hit.sha,
      fetchedAt,
      license: meta.license,
      fork: meta.fork,
      parent: meta.parent,
      contentHash: sha256Hex(text),
    });
  }

  writeJsonl(HITS_FILE, collected);
  process.stderr.write(`[collect] ${collected.length} unique hits across ${QUERIES.length} queries\n`);
  return collected;
}

function cachedSearchTotal(): number {
  let total = 0;
  for (const query of QUERIES) {
    for (const file of cachedSearchPages(query.id)) {
      total += (readJson<SearchHit[]>(file) ?? []).length;
    }
  }
  return total;
}

/** Reads the collected hits from cache without touching the network. */
export function readCollected(): CollectedHit[] {
  return readJsonl<CollectedHit>(HITS_FILE);
}

/** Total raw search results cached across all queries, before dedup. */
export function rawSearchTotal(): number {
  return cachedSearchTotal();
}
