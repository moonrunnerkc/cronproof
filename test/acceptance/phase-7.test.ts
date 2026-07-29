import { describe, expect, test } from 'vitest';
import { runCheck } from '../../src/cli/commands/check';
import { EXIT } from '../../src/cli/types';
import { dateArg, makeArgs } from './support';

// Phase 7 built the CLI. Criteria reconstructed from the phase-7 DECISIONS
// entries and the README exit-code table: a documented exit-code contract
// and a deterministic result model.

describe('phase 7: the CLI exit-code contract and a deterministic result', () => {
  test('a clean check yields the base exit code 0', () => {
    const result = runCheck(
      makeArgs({ positional: '0 12 * * *', zone: 'America/New_York', from: dateArg(2024, 1, 1), to: dateArg(2025, 1, 1) }),
    );
    expect('model' in result).toBe(true);
    if ('model' in result) {
      expect(result.model.baseExit).toBe(EXIT.clean);
    }
  });

  test('a missing required option is a usage error, not a crash', () => {
    const result = runCheck(makeArgs({ positional: '30 2 * * *', zone: null }));
    expect('usageError' in result).toBe(true);
  });

  test('two checks on identical inputs produce identical result data (reproducibility)', () => {
    const args = makeArgs({ positional: '30 2 * * *', zone: 'Europe/Berlin', from: dateArg(2024, 1, 1), to: dateArg(2025, 1, 1) });
    const a = runCheck(args);
    const b = runCheck(args);
    expect('model' in a && 'model' in b).toBe(true);
    if ('model' in a && 'model' in b) {
      expect(JSON.stringify(a.model.data)).toBe(JSON.stringify(b.model.data));
    }
  });
});
