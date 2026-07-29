import { describe, expect, test } from 'vitest';
import { LineIndex } from '../../src/scan/index';
import { maskCommentsAndStrings, matchParen } from '../../src/scan/js-lex';
import { maskComments } from '../../src/scan/text-locate';

describe('LineIndex offset mapping', () => {
  const text = 'first\nsecond line\n\nfourth';
  const index = new LineIndex(text);

  test('the first character is line 1 column 1', () => {
    expect(index.locate(0)).toEqual({ line: 1, column: 1 });
  });

  test('a character mid-line reports its 1-based column', () => {
    // offset 6 is the 's' that begins "second line" on line 2
    expect(index.locate(6)).toEqual({ line: 2, column: 1 });
    expect(index.locate(13)).toEqual({ line: 2, column: 8 });
  });

  test('a blank line still resolves to its own line', () => {
    expect(index.locate(text.indexOf('fourth'))).toEqual({ line: 4, column: 1 });
  });
});

describe('masking comments and strings in C-family source', () => {
  test('a call inside a line comment is blanked so it will not match', () => {
    const masked = maskCommentsAndStrings("run();\n// cron.schedule('* * * * *')\nmore();");
    expect(masked.includes('schedule')).toBe(false);
    expect(masked.includes('run()')).toBe(true);
  });

  test('string bodies are blanked but the surrounding code is preserved', () => {
    const masked = maskCommentsAndStrings('const x = "cron.schedule(here)"; call();');
    expect(masked.includes('cron.schedule')).toBe(false);
    expect(masked.includes('call()')).toBe(true);
  });

  test('masking preserves offsets so newlines and length are unchanged', () => {
    const source = 'a\n/* block\ncomment */\nb';
    const masked = maskCommentsAndStrings(source);
    expect(masked.length).toBe(source.length);
    expect(masked.split('\n').length).toBe(source.split('\n').length);
  });

  test('matchParen finds the matching close paren over masked parens in strings', () => {
    const source = 'f( ")" , g(1) )';
    const masked = maskCommentsAndStrings(source);
    const open = source.indexOf('(');
    expect(masked[matchParen(masked, open)]).toBe(')');
    expect(matchParen(masked, open)).toBe(source.length - 1);
  });
});

describe('masking comments in config files while keeping string values', () => {
  test('a hash comment is blanked so its schedule cannot be matched', () => {
    const masked = maskComments('# crons = ["0 0 * * *"]\ncrons = ["30 2 * * *"]', 'hash');
    expect(masked.includes('0 0 * * *')).toBe(false);
    expect(masked.includes('30 2 * * *')).toBe(true);
  });

  test('a hash inside a quoted value is a value, not a comment', () => {
    const masked = maskComments('url = "https://example.test#frag"\ncrons = ["30 2 * * *"]', 'hash');
    expect(masked.includes('30 2 * * *')).toBe(true);
    expect(masked.includes('#frag')).toBe(true);
  });

  test('a slash line comment is blanked in JSONC', () => {
    const masked = maskComments('// "crons": ["0 0 * * *"]\n"crons": ["30 2 * * *"]', 'slash');
    expect(masked.includes('0 0 * * *')).toBe(false);
    expect(masked.includes('30 2 * * *')).toBe(true);
  });

  test('a block comment spanning lines is blanked without losing those lines', () => {
    const source = '{\n/* "crons": ["0 0 * * *"]\n   more */\n"crons": ["30 2 * * *"]\n}';
    const masked = maskComments(source, 'slash');
    expect(masked.includes('0 0 * * *')).toBe(false);
    expect(masked.includes('30 2 * * *')).toBe(true);
    expect(masked.split('\n').length).toBe(source.split('\n').length);
  });

  test('a double slash inside a URL string is not treated as a comment', () => {
    const masked = maskComments('{"a": "https://x//y", "crons": ["30 2 * * *"]}', 'slash');
    expect(masked.includes('30 2 * * *')).toBe(true);
  });

  test('masking preserves length so a masked offset still maps to its source line', () => {
    const source = 'a = 1 # note\nb = "keep"\n';
    const masked = maskComments(source, 'hash');
    expect(masked.length).toBe(source.length);
    expect(new LineIndex(masked).locate(masked.indexOf('keep'))).toEqual(
      new LineIndex(source).locate(source.indexOf('keep')),
    );
  });

  test('an escaped quote inside a double-quoted value does not end the string', () => {
    const masked = maskComments('a = "x\\"# still string" # real comment\n', 'hash');
    expect(masked.includes('still string')).toBe(true);
    expect(masked.includes('real comment')).toBe(false);
  });
});
