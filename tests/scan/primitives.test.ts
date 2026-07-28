import { describe, expect, test } from 'vitest';
import { LineIndex } from '../../src/scan/index';
import { maskCommentsAndStrings, matchParen } from '../../src/scan/js-lex';

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
