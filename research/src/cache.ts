/**
 * The on-disk cache and artifact store. Stage 1 writes raw search
 * pages, repo metadata, and file blobs here; every later stage reads
 * from it and never touches the network. Keeping the raw responses is
 * what lets a skeptic rerun stages 2 through 4 and get the same numbers
 * without a GitHub account.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './config';

const SEARCH_DIR = path.join(CACHE_DIR, 'search');
const REPO_DIR = path.join(CACHE_DIR, 'repo');
const BLOB_DIR = path.join(CACHE_DIR, 'blobs');

/** Creates every cache subdirectory if missing. */
export function ensureCacheDirs(): void {
  for (const dir of [CACHE_DIR, SEARCH_DIR, REPO_DIR, BLOB_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

function repoKey(repo: string): string {
  return repo.replace('/', '__');
}

/** Path of a cached search page. */
export function searchPagePath(queryId: string, page: number): string {
  return path.join(SEARCH_DIR, `${queryId}-p${page}.json`);
}

/** Reads a JSON file, or returns null when it does not exist. */
export function readJson<T>(file: string): T | null {
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

/** Writes a value as pretty JSON with a trailing newline. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Reads cached repo metadata by repo name, or null when absent. */
export function readRepoMeta<T>(repo: string): T | null {
  return readJson<T>(path.join(REPO_DIR, `${repoKey(repo)}.json`));
}

/** Writes repo metadata to the cache. */
export function writeRepoMeta(repo: string, value: unknown): void {
  writeJson(path.join(REPO_DIR, `${repoKey(repo)}.json`), value);
}

/** Whether a blob with this content hash is already cached. */
export function hasBlob(contentHash: string): boolean {
  return existsSync(path.join(BLOB_DIR, `${contentHash}.txt`));
}

/** Writes a decoded blob under its content hash. */
export function writeBlob(contentHash: string, text: string): void {
  writeFileSync(path.join(BLOB_DIR, `${contentHash}.txt`), text, 'utf8');
}

/** Reads a decoded blob by content hash, or null when absent. */
export function readBlob(contentHash: string): string | null {
  const file = path.join(BLOB_DIR, `${contentHash}.txt`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/** Reads a JSONL file into an array, or an empty array when absent. */
export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

/** Writes an array as JSONL (one compact object per line). */
export function writeJsonl(file: string, rows: unknown[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  writeFileSync(file, rows.length === 0 ? '' : `${body}\n`, 'utf8');
}

/** Lists cached search page files for a query id, in page order. */
export function cachedSearchPages(queryId: string): string[] {
  if (!existsSync(SEARCH_DIR)) {
    return [];
  }
  return readdirSync(SEARCH_DIR)
    .filter((name) => name.startsWith(`${queryId}-p`) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(SEARCH_DIR, name));
}
