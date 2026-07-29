import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { CORPUS_FILE, filter } from '../../research/src/stage2-filter';
import { analyze, ANALYSIS_FILE } from '../../research/src/stage3-analyze';
import { hasCollected } from '../../research/src/stage1-collect';

/**
 * The cache is deliberately not committed, so a checkout has the published
 * out/ artifacts and no cache. The stages that recompute from the cache must
 * refuse in that state: writing zero rows would silently replace a real
 * corpus with an empty one and every downstream metric would read 0/0.
 */
describe('a missing cache stops the recomputing stages instead of emptying the corpus', () => {
  const cold = !hasCollected();

  test.skipIf(!cold)('filter refuses and names the cache it needs', () => {
    const before = readFileSync(CORPUS_FILE, 'utf8');
    expect(() => filter()).toThrow(/no collected hits/);
    expect(readFileSync(CORPUS_FILE, 'utf8')).toBe(before);
  });

  test.skipIf(!cold)('analyze refuses when the corpus lists files whose content is gone', () => {
    const before = readFileSync(ANALYSIS_FILE, 'utf8');
    expect(() => analyze()).toThrow(/no content is cached/);
    expect(readFileSync(ANALYSIS_FILE, 'utf8')).toBe(before);
  });

  test('the published artifacts the guards protect are present in the checkout', () => {
    expect(existsSync(CORPUS_FILE)).toBe(true);
    expect(existsSync(ANALYSIS_FILE)).toBe(true);
    expect(readFileSync(CORPUS_FILE, 'utf8').trim().length).toBeGreaterThan(0);
  });
});
