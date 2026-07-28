import { defineConfig } from 'vitest/config';

/*
 * Vitest configuration used only by the Stryker mutation run. It
 * includes the deterministic, input-bounded suites that directly cover
 * src/hazard and src/tz: the timezone engine tests, the hazard
 * classifier tests, and the adversarial zone corpus.
 *
 * The fast-check property suites are deliberately excluded from the
 * mutation harness. Their large generated windows and instant ranges
 * amplify a mutant with a broken loop bound into an out-of-memory hang
 * that crashes the vitest worker before Stryker's timeout can fire,
 * which only adds runner-restart overhead without changing the verdict.
 * Their role, proving invariants over random inputs, is separate from
 * mutation killing and is reported on its own. The cron suites are
 * excluded too: they import only src/cron, so under perTest coverage
 * they never cover a src/hazard or src/tz mutant.
 */
export default defineConfig({
  test: {
    include: [
      'tests/tz/**/*.test.ts',
      'tests/hazard/**/*.test.ts',
      'tests/adversarial/**/*.test.ts',
    ],
  },
});
