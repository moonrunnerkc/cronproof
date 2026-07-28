/**
 * A thin authenticated GitHub client for the collector. It reads the
 * token from the gh CLI, honors both the primary rate-limit headers and
 * secondary-limit Retry-After, and backs off rather than hammering. It
 * is used only by stage 1; every later stage reads the cache, so the
 * network is touched exactly once per corpus.
 */

import { spawnSync } from 'node:child_process';
import type { RepoMeta, SearchHit } from './types';

const API = 'https://api.github.com';

function token(): string {
  const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  const value = (result.stdout ?? '').trim();
  if (value === '') {
    throw new Error('no GitHub token: run `gh auth login` first');
  }
  return value;
}

const AUTH = token();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Fetched {
  status: number;
  headers: Headers;
  body: unknown;
}

async function once(url: string): Promise<Fetched> {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${AUTH}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'cronproof-corpus-study',
      'x-github-api-version': '2022-11-28',
    },
  });
  const text = await response.text();
  const body: unknown = text === '' ? null : JSON.parse(text);
  return { status: response.status, headers: response.headers, body };
}

/** Milliseconds to wait when a rate limit is hit, from the response headers. */
function backoffMillis(headers: Headers): number {
  const retryAfter = headers.get('retry-after');
  if (retryAfter !== null) {
    return (Number(retryAfter) + 1) * 1000;
  }
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  if (remaining === '0' && reset !== null) {
    const waitMs = Number(reset) * 1000 - Date.now() + 1000;
    return waitMs > 0 ? waitMs : 1000;
  }
  return 2000;
}

/** Fetches a URL as JSON, backing off and retrying on rate limits. */
export async function ghGet(url: string, maxRetries = 8): Promise<Fetched> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const result = await once(url);
    if (result.status === 403 || result.status === 429) {
      const wait = backoffMillis(result.headers);
      process.stderr.write(`[collect] rate limited (${result.status}); waiting ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
      continue;
    }
    // Stay well under the 10 req/min search budget between successful calls.
    const remaining = result.headers.get('x-ratelimit-remaining');
    if (remaining !== null && Number(remaining) <= 1) {
      await sleep(backoffMillis(result.headers));
    }
    return result;
  }
  throw new Error(`giving up on ${url} after ${maxRetries} retries`);
}

interface SearchResponse {
  items?: { path: string; sha: string; repository: { full_name: string } }[];
}

/** Runs one page of code search, returning the hits on that page. */
export async function searchCode(queryId: string, q: string, page: number): Promise<SearchHit[]> {
  const url = `${API}/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
  const { status, body } = await ghGet(url);
  if (status !== 200) {
    throw new Error(`search failed (${status}) for "${q}" page ${page}`);
  }
  const items = (body as SearchResponse).items ?? [];
  return items.map((item) => ({
    query: queryId,
    repo: item.repository.full_name,
    path: item.path,
    sha: item.sha,
  }));
}

interface RepoResponse {
  fork?: boolean;
  parent?: { full_name: string } | null;
  license?: { spdx_id: string | null } | null;
}

/** Fetches repository metadata used by the exclusion rules. */
export async function repoMeta(repo: string): Promise<RepoMeta> {
  const { status, body } = await ghGet(`${API}/repos/${repo}`);
  if (status !== 200) {
    return { repo, fork: false, parent: null, license: null };
  }
  const data = body as RepoResponse;
  const spdx = data.license?.spdx_id ?? null;
  return {
    repo,
    fork: data.fork ?? false,
    parent: data.parent?.full_name ?? null,
    license: spdx === 'NOASSERTION' ? null : spdx,
  };
}

interface BlobResponse {
  content?: string;
  encoding?: string;
}

/**
 * Fetches and decodes a file's UTF-8 content by its git blob sha, the
 * sha the code-search API returns for each hit. The git blobs API takes
 * that sha directly, unlike the contents API which needs a commit ref.
 * Returns null on any non-200 or unexpected encoding.
 */
export async function fileContent(repo: string, blobSha: string): Promise<string | null> {
  const { status, body } = await ghGet(`${API}/repos/${repo}/git/blobs/${blobSha}`);
  if (status !== 200) {
    return null;
  }
  const data = body as BlobResponse;
  if (data.encoding !== 'base64' || data.content === undefined) {
    return null;
  }
  return Buffer.from(data.content, 'base64').toString('utf8');
}
