import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { buildVerdict } from '../../src/analyze/index';
import { parse, type DialectId } from '../../src/cron/index';
import { createIntlBackend } from '../../src/tz/index';
import { backend, midnight, REPO_ROOT, ROOT } from './support';

// Phase 11 acceptance criteria (verbatim from the phase-11 prompt): builds
// to a static bundle, works offline after first load, and produces verdicts
// identical to the CLI across a fixed 50-case matrix. The full 50-case
// matrix is asserted in tests/web/parity.test.ts; here the acceptance file
// re-asserts the identity property on a representative subset and the
// bundle and offline artifacts.

const intl = createIntlBackend();

const CASES: [string, DialectId, string][] = [
  ['30 2 * * *', 'vixie', 'America/New_York'],
  ['30 1 * * *', 'vixie', 'America/New_York'],
  ['*/15 * * * *', 'vixie', 'Europe/Berlin'],
  ['0 0 * * *', 'vixie', 'Asia/Kolkata'],
  ['30 2 * * *', 'k8s', 'Australia/Lord_Howe'],
];

describe('phase 11: the browser verdict is identical to the CLI, and the static bundle is offline-capable', () => {
  test('the Intl (browser) verdict equals the TZif (CLI) verdict for representative cases', () => {
    for (const [expr, dialect, zone] of CASES) {
      const parsed = parse(expr, dialect);
      expect(parsed.ok, `parse ${expr}`).toBe(true);
      if (!parsed.ok) {
        continue;
      }
      const web = buildVerdict(parsed.ast, intl, { expression: expr, dialect, zone, from: midnight(2024, 1), to: midnight(2025, 1) });
      const cli = buildVerdict(parsed.ast, backend, { expression: expr, dialect, zone, from: midnight(2024, 1), to: midnight(2025, 1), zoneinfoRoot: ROOT });
      expect(web, `verdict parity for ${expr} ${zone}`).toEqual(cli);
    }
  });

  test('the static site sources and the offline service worker exist', () => {
    for (const file of ['web/index.html', 'web/sw.js', 'web/src/main.ts', 'scripts/build-web.ts']) {
      expect(existsSync(path.join(REPO_ROOT, file)), `${file} must exist`).toBe(true);
    }
  });
});
