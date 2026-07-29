import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  DOC_FILES,
  loadRegistry,
  proseNumbers,
  proseUrls,
  SOURCES_DIR,
  traceNumber,
} from '../../scripts/claims-support';
import { REPO_ROOT } from './support';

// Phase 13 acceptance criteria (verbatim from the phase-13 prompt): every
// external claim has a fetched URL, every number traces to EVIDENCE.md or the
// research report, and a link checker passes. This asserts the offline,
// deterministic core: every doc URL and number is registered and traceable,
// and every snapshot hash matches. The network resolve and drift checks run
// in the "docs claims and numbers" CI job (pnpm check-claims).

const registry = loadRegistry(REPO_ROOT);

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('phase 13: every external claim is sourced and every measured number traces to an origin', () => {
  test('every external URL in the docs is a skiplisted link or a registered claim', () => {
    const known = new Set([...registry.claimSkiplist, ...registry.claims.map((c) => c.url)]);
    for (const file of DOC_FILES) {
      for (const url of proseUrls(readFileSync(path.join(REPO_ROOT, file), 'utf8'))) {
        expect(known.has(url), `${file}: ${url} has no provenance entry`).toBe(true);
      }
    }
  });

  test('every measured number in the docs is registered and traces to its origin', () => {
    const registered = new Set(registry.numbers.map((n) => n.value));
    for (const file of DOC_FILES) {
      for (const num of proseNumbers(readFileSync(path.join(REPO_ROOT, file), 'utf8'), registry.numberAllowlist)) {
        expect(registered.has(num), `${file}: number ${num} is not registered`).toBe(true);
      }
    }
    for (const entry of registry.numbers) {
      expect(traceNumber(REPO_ROOT, entry), `number ${entry.value} does not trace to ${entry.origin}`).toBe(true);
    }
  });

  test('every claim snapshot exists and its stored hash matches the file', () => {
    for (const claim of registry.claims) {
      const file = path.join(REPO_ROOT, SOURCES_DIR, claim.snapshot);
      expect(existsSync(file), `snapshot ${claim.snapshot} must exist`).toBe(true);
      expect(sha256(readFileSync(file, 'utf8')), `hash of ${claim.snapshot}`).toBe(claim.sha256);
      expect(readFileSync(file, 'utf8').includes(claim.anchor), `anchor in ${claim.snapshot}`).toBe(true);
    }
  });
});
