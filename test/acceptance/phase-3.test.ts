import { describe, expect, test } from 'vitest';
import { enumerate, parse, type DialectId } from '../../src/cron/index';
import { midnight } from './support';

// Phase 3 built the cron parser and enumerator. Criteria reconstructed
// from the phase-3 DECISIONS entries: seven dialects parse, enumeration
// is strict wall-clock order, and invalid expressions are rejected.

const DIALECTS: DialectId[] = ['vixie', 'debian', 'quartz', 'k8s', 'systemd', 'github-actions', 'aws-eventbridge'];

describe('phase 3: seven dialects parse and enumeration is in strict wall-clock order', () => {
  test('every supported dialect parses a valid expression in its own grammar', () => {
    const samples: Record<DialectId, string> = {
      vixie: '30 2 * * *',
      debian: '30 2 * * *',
      quartz: '0 30 2 * * ?',
      k8s: '30 2 * * *',
      systemd: '*-*-* 02:30:00',
      'github-actions': '30 2 * * *',
      'aws-eventbridge': '30 2 * * ? *',
    };
    for (const dialect of DIALECTS) {
      expect(parse(samples[dialect], dialect).ok, `${dialect} should parse ${samples[dialect]}`).toBe(true);
    }
  });

  test('enumeration returns firings in strictly increasing wall-clock order', () => {
    const parsed = parse('*/15 * * * *', 'vixie');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const firings = enumerate(parsed.ast, { zone: 'UTC', from: midnight(2024, 3, 10), to: midnight(2024, 3, 11) });
    expect(firings.length).toBe(96);
    for (let i = 1; i < firings.length; i += 1) {
      const prev = firings[i - 1];
      const cur = firings[i];
      const before = prev !== undefined && cur !== undefined && (prev.hour < cur.hour || (prev.hour === cur.hour && prev.minute < cur.minute));
      expect(before).toBe(true);
    }
  });

  test('an out-of-range field is rejected rather than parsed', () => {
    expect(parse('99 2 * * *', 'vixie').ok).toBe(false);
  });
});
