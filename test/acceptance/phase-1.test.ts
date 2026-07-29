import { describe, expect, test } from 'vitest';
import { firstDifference, normalizeEvidence } from '../../scripts/evidence-lib';

// Phase 1 built the evidence harness. Its acceptance criteria are not in
// this session verbatim (the phase-1 prompt predates it), so they are
// reconstructed from the harness's contract in CLAUDE.md rule 8: the
// script regenerates EVIDENCE.md from real command output and a claim not
// produced by the script is caught as drift.

describe('phase 1: the evidence harness regenerates EVIDENCE.md and catches drift', () => {
  test('identical regenerated output normalizes to no difference', () => {
    const doc = '## test\n\n```\nTests  313 passed (313)\nDuration  1.2s\n```\n';
    expect(firstDifference(normalizeEvidence(doc), normalizeEvidence(doc))).toBeNull();
  });

  test('a claim not produced by the script is caught as a drift difference', () => {
    const committed = '## test\n\n```\nTests  313 passed (313)\n```\n';
    const regenerated = '## test\n\n```\nTests  314 passed (314)\n```\n';
    expect(firstDifference(normalizeEvidence(committed), normalizeEvidence(regenerated))).not.toBeNull();
  });
});
