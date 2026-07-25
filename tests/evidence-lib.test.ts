import { describe, expect, it } from 'vitest';
import {
  firstDifference,
  normalizeEvidence,
  renderEvidence,
  type CommandResult,
  type RunMetadata,
} from '../scripts/evidence-lib';

function metadataFor(root: string, sha: string, when: string): RunMetadata {
  return {
    generatedAt: when,
    gitSha: sha,
    workingTreeDirty: false,
    repoRoot: root,
    nodeVersion: 'v22.16.0',
    icuVersion: '77.1',
    tzdbVersion: '2025b',
  };
}

function resultsFor(root: string, durationMs: number): CommandResult[] {
  return [
    {
      title: 'test (with coverage)',
      commandLine: 'pnpm run test',
      exitCode: 0,
      stdout: `> cronproof@0.1.0 test ${root}\nStart at 09:15:31\nDuration ${durationMs}ms\nTests 2 passed`,
      stderr: '',
    },
  ];
}

describe('normalizeEvidence', () => {
  it('makes two runs equal when they differ only in timestamp, git SHA, repo root, clock times, and durations', () => {
    const runA = renderEvidence(
      metadataFor('/home/alice/cronproof', 'aaa111', '2026-07-25T10:00:00.000Z'),
      resultsFor('/home/alice/cronproof', 653),
    );
    const runB = renderEvidence(
      metadataFor('/ci/work/cronproof', 'bbb222', '2026-07-26T04:30:00.000Z'),
      resultsFor('/ci/work/cronproof', 12),
    );
    expect(normalizeEvidence(runA)).toBe(normalizeEvidence(runB));
  });

  it('keeps two runs different when command output genuinely differs', () => {
    const base = metadataFor('/repo', 'aaa111', '2026-07-25T10:00:00.000Z');
    const passing = renderEvidence(base, resultsFor('/repo', 100));
    const failing = renderEvidence(base, [
      { ...resultsFor('/repo', 100)[0]!, exitCode: 1, stdout: 'Tests 1 failed' },
    ]);
    expect(normalizeEvidence(passing)).not.toBe(normalizeEvidence(failing));
  });

  it('treats output lines inside a block as an order-insensitive multiset, since concurrent build tools interleave log lines', () => {
    const base = metadataFor('/repo', 'aaa111', '2026-07-25T10:00:00.000Z');
    const orderA = renderEvidence(base, [
      {
        title: 'build',
        commandLine: 'pnpm run build',
        exitCode: 0,
        stdout: 'ESM done\nCJS done',
        stderr: '',
      },
    ]);
    const orderB = renderEvidence(base, [
      {
        title: 'build',
        commandLine: 'pnpm run build',
        exitCode: 0,
        stdout: 'CJS done\nESM done',
        stderr: '',
      },
    ]);
    expect(normalizeEvidence(orderA)).toBe(normalizeEvidence(orderB));
  });

  it('keeps exit codes visible after normalization', () => {
    const document = renderEvidence(
      metadataFor('/repo', 'aaa111', '2026-07-25T10:00:00.000Z'),
      resultsFor('/repo', 100),
    );
    expect(normalizeEvidence(document)).toContain('Exit code: 0');
  });
});

describe('firstDifference', () => {
  it('returns null for identical documents', () => {
    expect(firstDifference('a\nb', 'a\nb')).toBeNull();
  });

  it('names the first line where two documents diverge', () => {
    const difference = firstDifference('same\nold', 'same\nnew');
    expect(difference).toContain('line 2');
    expect(difference).toContain('old');
    expect(difference).toContain('new');
  });
});
