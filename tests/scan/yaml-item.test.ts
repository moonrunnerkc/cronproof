import { describe, expect, test } from 'vitest';
import { intentContext, itemBounds, parseKeyLine } from '../../src/scan/scanners/yaml-item';

function keyAt(lines: string[], index: number) {
  const key = parseKeyLine(lines[index] ?? '');
  if (key === null) {
    throw new Error(`line ${index} is not a key line`);
  }
  return key;
}

describe('reading a YAML key line', () => {
  test('a sequence dash counts toward the key indent, so siblings line up', () => {
    expect(parseKeyLine('    - cron: "0 0 * * *"')).toEqual({
      prefix: '    - cron: ',
      keyIndent: 6,
      startsItem: true,
      name: 'cron',
      value: '"0 0 * * *"',
    });
    expect(parseKeyLine('      timezone: UTC')?.keyIndent).toBe(6);
  });

  test('a block opener parses with an empty value', () => {
    expect(parseKeyLine('on:')).toMatchObject({ name: 'on', value: '', keyIndent: 0 });
  });

  test('a comment, a blank line, and a bare sequence scalar are not key lines', () => {
    expect(parseKeyLine('    # cron: "0 0 * * *"')).toBeNull();
    expect(parseKeyLine('')).toBeNull();
    expect(parseKeyLine('    - "0 0 * * *"')).toBeNull();
  });
});

describe('scoping a key to the sequence item it belongs to', () => {
  const lines = [
    'on:',
    '  schedule:',
    '    - cron: "0 0 * * *"',
    '      timezone: America/Denver',
    '    - cron: "0 1 * * *"',
    '      with:',
    '        note: second',
    '  push: {}',
  ];

  test('an item spans its own keys and their nested lines', () => {
    expect(itemBounds(lines, 2, keyAt(lines, 2))).toEqual({ start: 2, end: 3 });
    expect(itemBounds(lines, 4, keyAt(lines, 4))).toEqual({ start: 4, end: 6 });
  });

  test('a key after the opening dash resolves back to the same item', () => {
    expect(itemBounds(lines, 3, keyAt(lines, 3))).toEqual({ start: 2, end: 3 });
  });

  test('an item ends before the next dash and before the enclosing block s next key', () => {
    const bounds = itemBounds(lines, 4, keyAt(lines, 4));
    expect(bounds.end).toBeLessThan(7);
  });
});

describe('collecting the prose that annotates a key', () => {
  test('comments above the key and the enclosing name value are collected', () => {
    const lines = [
      '# runs at local midnight',
      'name: nightly',
      '',
      'on:',
      '  schedule:',
      '    - cron: "0 0 * * *"',
    ];
    const text = intentContext(lines, 5, keyAt(lines, 5));
    expect(text).toContain('runs at local midnight');
    expect(text).toContain('nightly');
  });

  test('the walk stops at a sibling item, so one item s comment stays with it', () => {
    const lines = [
      'on:',
      '  schedule:',
      '    # ops wanted this at midnight',
      '    - cron: "0 0 * * *"',
      '    - cron: "15 6 * * 1"',
    ];
    expect(intentContext(lines, 4, keyAt(lines, 4))).not.toContain('midnight');
  });
});
