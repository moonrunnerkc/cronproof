import { describe, expect, test } from 'vitest';
import { applyFilter } from '../../research/src/stage2-filter';
import type { CollectedHit } from '../../research/src/types';

function hit(over: Partial<CollectedHit>): CollectedHit {
  return {
    query: 'k8s-cronjob',
    repo: 'acme/app',
    path: 'deploy/cronjob.yaml',
    sha: 'sha1',
    fetchedAt: '2025-01-01T00:00:00.000Z',
    license: 'MIT',
    fork: false,
    parent: null,
    contentHash: 'hashA',
    ...over,
  };
}

function countOf(result: ReturnType<typeof applyFilter>, rule: string): number {
  return result.excluded.find((row) => row.rule === rule)?.count ?? -1;
}

describe('each exclusion rule removes the hits it is meant to and is counted', () => {
  test('vendored, library-or-fixture, and fork hits are each excluded and charged to their rule', () => {
    const result = applyFilter([
      hit({ repo: 'a/keep', path: 'k8s/cronjob.yaml', sha: 's1', contentHash: 'h1' }),
      hit({ repo: 'a/vend', path: 'vendor/x/cronjob.yaml', sha: 's2', contentHash: 'h2' }),
      hit({ repo: 'a/node', path: 'node_modules/y/wrangler.toml', sha: 's3', contentHash: 'h3' }),
      hit({ repo: 'harrisiirak/cron-parser', path: 'crontab', sha: 's4', contentHash: 'h4' }),
      hit({ repo: 'a/fix', path: 'test/fixtures/vercel.json', sha: 's5', contentHash: 'h5' }),
      hit({ repo: 'a/forked', path: 'k8s/cronjob.yaml', sha: 's6', contentHash: 'h6', fork: true }),
    ]);
    expect(result.rows.map((row) => row.repo)).toEqual(['a/keep']);
    expect(countOf(result, 'vendored')).toBe(2);
    expect(countOf(result, 'library-or-fixture')).toBe(2);
    expect(countOf(result, 'fork')).toBe(1);
  });

  test('duplicate content is removed and the first occurrence in sorted order is kept', () => {
    const result = applyFilter([
      hit({ repo: 'b/second', path: 'p.yaml', sha: 's2', contentHash: 'same' }),
      hit({ repo: 'a/first', path: 'p.yaml', sha: 's1', contentHash: 'same' }),
      hit({ repo: 'c/third', path: 'p.yaml', sha: 's3', contentHash: 'same' }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.repo).toBe('a/first');
    expect(countOf(result, 'duplicate')).toBe(2);
  });

  test('a hit that matches two rules is charged only to the first rule in order', () => {
    const result = applyFilter([
      hit({ repo: 'a/forked', path: 'vendor/x/cronjob.yaml', sha: 's1', contentHash: 'h1', fork: true }),
    ]);
    expect(countOf(result, 'vendored')).toBe(1);
    expect(countOf(result, 'fork')).toBe(0);
    expect(result.rows).toHaveLength(0);
  });
});

describe('filtering is deterministic', () => {
  test('the same hits produce the same corpus rows and the same counts on every run', () => {
    const hits = [
      hit({ repo: 'z/one', path: 'a.yaml', sha: 's1', contentHash: 'h1' }),
      hit({ repo: 'a/two', path: 'b.yaml', sha: 's2', contentHash: 'h2' }),
      hit({ repo: 'm/dup', path: 'c.yaml', sha: 's3', contentHash: 'h1' }),
    ];
    const first = applyFilter(hits);
    const second = applyFilter([...hits].reverse());
    expect(JSON.stringify(second.rows)).toBe(JSON.stringify(first.rows));
    expect(JSON.stringify(second.excluded)).toBe(JSON.stringify(first.excluded));
    // Rows are sorted by repo before dedup, so among the two h1 copies
    // (m/dup and z/one) the sorted-first m/dup is kept, deterministically.
    expect(first.rows.map((row) => row.repo)).toEqual(['a/two', 'm/dup']);
  });
});
