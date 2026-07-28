import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { compileIgnore, parseSuppressions, scanRepo } from '../../src/scan/index';

const FIXTURE = fileURLToPath(new URL('./fixture', import.meta.url));
const result = scanRepo(FIXTURE);

describe('inline suppression comments', () => {
  test('a suppression with a reason removes the finding and records the reason', () => {
    const suppressed = result.suppressed.find(
      (item) => item.finding.file === 'suppressions.crontab' && item.finding.line === 2,
    );
    expect(suppressed?.reason).toBe('legacy job, decommissioned 2026 Q4');
    const stillReported = result.findings.some(
      (f) => f.file === 'suppressions.crontab' && f.line === 2,
    );
    expect(stillReported).toBe(false);
  });

  test('a reasonless suppression does not silence the finding and is itself reported', () => {
    const stillReported = result.findings.some(
      (f) => f.file === 'suppressions.crontab' && f.line === 4,
    );
    expect(stillReported).toBe(true);
    const diagnostic = result.diagnostics.find(
      (d) => d.file === 'suppressions.crontab' && d.code === 'suppression-missing-reason',
    );
    expect(diagnostic).toBeDefined();
  });

  test('parseSuppressions captures the reason and flags a bare directive as null', () => {
    const directives = parseSuppressions(
      ['0 0 * * * job # cronproof-ignore: has a reason', '0 1 * * * job # cronproof-ignore'].join(
        '\n',
      ),
    );
    expect(directives).toEqual([
      { line: 1, reason: 'has a reason' },
      { line: 2, reason: null },
    ]);
  });
});

describe('.cronproofignore', () => {
  test('a file under an ignored directory is not scanned', () => {
    const leaked = result.findings.some((f) => f.file.startsWith('ignored/'));
    expect(leaked).toBe(false);
  });

  test('a trailing-slash rule matches directories but not a same-named file', () => {
    const matcher = compileIgnore('build/\n');
    expect(matcher.ignores('build', true)).toBe(true);
    expect(matcher.ignores('build', false)).toBe(false);
  });

  test('node_modules and .git are always ignored regardless of the ignore file', () => {
    const matcher = compileIgnore('');
    expect(matcher.ignores('node_modules', true)).toBe(true);
    expect(matcher.ignores('.git', true)).toBe(true);
  });

  test('an anchored rule matches only at the root', () => {
    const matcher = compileIgnore('/dist\n');
    expect(matcher.ignores('dist', true)).toBe(true);
    expect(matcher.ignores('packages/dist', true)).toBe(false);
  });
});
