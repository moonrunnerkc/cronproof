import { describe, expect, test } from 'vitest';
import { report } from '../../research/src/stage4-report';

// Phase 12 acceptance criteria (verbatim from the phase-12 prompt): an
// end-to-end run from a clean cache produces a report with all denominators,
// and a second run from cache reproduces byte-identical numbers. The report
// step is a pure function of the committed research/out/analysis.jsonl, so
// it is reproducible here with no cache and no network (the collect step,
// which needs a token, is not exercised by this test).

describe('phase 12: the report has visible denominators and reproduces byte-identically', () => {
  test('two report runs over the committed analysis produce a byte-identical document', () => {
    const first = report().document;
    const second = report().document;
    expect(second).toBe(first);
  });

  test('every headline and secondary rate is printed as numerator over denominator', () => {
    const { document } = report();
    // The headline, the all-zones rate, and the secondary rate are fractions.
    const fractions = document.match(/\b\d+\/\d+ \(/g) ?? [];
    expect(fractions.length).toBeGreaterThanOrEqual(3);
    expect(document).toContain('Kept after exclusions');
  });
});
