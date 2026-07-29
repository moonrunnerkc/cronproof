import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { scanRepo } from '../../src/scan/index';
import { REPO_ROOT } from './support';

// Phase 8 built the repository scanners. Criteria reconstructed from the
// phase-8 DECISIONS entry: schedules across many platforms are found with
// their file, line, and column and where the timezone came from, and
// .cronproofignore is honored.

const FIXTURE = path.join(REPO_ROOT, 'tests', 'scan', 'fixture');

describe('phase 8: schedules found across platforms with location and zone source', () => {
  test('the fixture tree yields findings from more than one platform, each anchored to a line and column', () => {
    const result = scanRepo(FIXTURE);
    expect(result.findings.length).toBeGreaterThan(0);
    const kinds = new Set(result.findings.map((f) => f.sourceKind));
    expect(kinds.size).toBeGreaterThan(1);
    for (const finding of result.findings) {
      expect(finding.line).toBeGreaterThanOrEqual(1);
      expect(finding.column).toBeGreaterThanOrEqual(1);
      expect(finding.file.length).toBeGreaterThan(0);
      expect(['explicit', 'inherited', 'platform-default', 'unknown']).toContain(finding.zoneSource.kind);
    }
  });

  test('a Kubernetes CronJob manifest is recognized among the findings', () => {
    const result = scanRepo(FIXTURE);
    expect(result.findings.some((f) => f.sourceKind === 'k8s-cronjob')).toBe(true);
  });

  test('a file excluded by .cronproofignore contributes no findings', () => {
    const result = scanRepo(FIXTURE);
    expect(result.findings.some((f) => f.file.includes('ignored/'))).toBe(false);
  });
});
