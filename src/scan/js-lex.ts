/**
 * Minimal lexical helpers for C-family source (JS, TS, Java). Masking
 * comment and string bodies lets a scanner match call and annotation
 * shapes in live code only, and brace/paren matching then works on the
 * masked text where quotes and comments cannot throw the depth off.
 * This is deliberately not a full parser: it is the smallest thing that
 * stops a commented-out or quoted call from reading as a real one.
 */

/**
 * Replaces comment and string bytes with spaces, preserving offsets and
 * newlines so positions in the masked text line up with the original.
 * @param text Source text.
 * @returns Same-length text with comment and string contents blanked.
 */
export function maskCommentsAndStrings(text: string): string {
  const out = text.split('');
  const blank = (from: number, to: number): void => {
    for (let j = from; j < to && j < out.length; j += 1) {
      if (out[j] !== '\n') {
        out[j] = ' ';
      }
    }
  };
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === '//') {
      let j = i + 2;
      while (j < text.length && text[j] !== '\n') {
        j += 1;
      }
      blank(i, j);
      i = j;
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const quote = text[i];
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          break;
        }
        j += 1;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/**
 * Finds the matching close paren for the open paren at the given index.
 * @param masked Masked source (from maskCommentsAndStrings).
 * @param openParen Index of the opening `(`.
 * @returns Index of the matching `)`, or the text length if unbalanced.
 */
export function matchParen(masked: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < masked.length; i += 1) {
    if (masked[i] === '(') {
      depth += 1;
    } else if (masked[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return masked.length;
}
