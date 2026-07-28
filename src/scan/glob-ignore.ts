/**
 * .cronproofignore matching. A small gitignore-flavored matcher so a
 * repo can exclude vendored trees, fixtures, or generated manifests
 * from the scan. Supported syntax: blank lines and `#` comments are
 * skipped; a leading `/` anchors to the scan root; a trailing `/`
 * matches directories only; `*` matches within a path segment; `**`
 * matches across segments. This is deliberately a subset: it covers
 * the exclusions a scan needs without reimplementing all of gitignore.
 */

/** Directory names never descended into, regardless of the ignore file. */
export const ALWAYS_IGNORED_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules']);

interface IgnoreRule {
  regex: RegExp;
  dirOnly: boolean;
}

/** A compiled set of ignore rules ready to test paths against. */
export interface IgnoreMatcher {
  /**
   * Tests a repo-relative POSIX path against the rules.
   * @param relPath Repo-relative POSIX path (no leading slash).
   * @param isDir Whether the path is a directory.
   * @returns Whether the path is ignored.
   */
  ignores(relPath: string, isDir: boolean): boolean;
}

function segmentToRegex(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch !== undefined && /[.+^${}()|[\]\\]/.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch ?? '';
    }
  }
  return out;
}

function compileRule(raw: string): IgnoreRule | null {
  let pattern = raw.trim();
  if (pattern.length === 0 || pattern.startsWith('#')) {
    return null;
  }
  const dirOnly = pattern.endsWith('/');
  if (dirOnly) {
    pattern = pattern.slice(0, -1);
  }
  const anchored = pattern.startsWith('/');
  if (anchored) {
    pattern = pattern.slice(1);
  }
  const body = segmentToRegex(pattern);
  // Anchored rules match from the root; unanchored rules match the
  // path or any suffix segment boundary, the gitignore default.
  const source = anchored ? `^${body}$` : `(^|/)${body}$`;
  return { regex: new RegExp(source), dirOnly };
}

/**
 * Compiles the contents of a .cronproofignore file into a matcher.
 * @param contents Raw file contents, or empty string when absent.
 * @returns A matcher that also honors the always-ignored directories.
 */
export function compileIgnore(contents: string): IgnoreMatcher {
  const rules: IgnoreRule[] = [];
  for (const line of contents.split('\n')) {
    const rule = compileRule(line);
    if (rule !== null) {
      rules.push(rule);
    }
  }
  return {
    ignores(relPath: string, isDir: boolean): boolean {
      const segments = relPath.split('/');
      const last = segments[segments.length - 1];
      if (isDir && last !== undefined && ALWAYS_IGNORED_DIRS.has(last)) {
        return true;
      }
      for (const rule of rules) {
        if (rule.dirOnly && !isDir) {
          continue;
        }
        if (rule.regex.test(relPath)) {
          return true;
        }
      }
      return false;
    },
  };
}
