/**
 * Locates compiled zoneinfo files. The root is configurable; the
 * default is the tzdata vendored in this package (vendor/zoneinfo,
 * compiled with zic from an IANA release), falling back to the system
 * path /usr/share/zoneinfo when no vendored copy is present.
 *
 * Vendored first, not system first. The vendored tree is the only one
 * whose release is pinned alongside the Node version in .nvmrc, so it
 * is the only default under which the tzdb agreement gate is
 * reproducible: two machines with different distro tzdata would
 * otherwise answer the same schedule differently. This is also the
 * order the CLI has always used in practice; the system-first rule
 * this module used to document applied to no shipped invocation.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The conventional system zoneinfo directory. */
export const SYSTEM_ZONEINFO_ROOT = '/usr/share/zoneinfo';

/**
 * Directory names inside a zoneinfo root that do not contain
 * ordinary zones: "right" holds leap-second-adjusted variants and
 * "posix" duplicates the default set.
 */
const EXCLUDED_DIRS = new Set(['right', 'posix']);

/**
 * Absolute path of the vendored zoneinfo directory shipped with this
 * package, or null when it cannot be located. The directory is found
 * by walking upward from this module, which works from both src/
 * (tsx) and dist/ (built) layouts.
 */
export function vendoredZoneinfoRoot(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, 'vendor', 'zoneinfo');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Resolves the zoneinfo root to use.
 * @param explicitRoot Override from --zoneinfo-root, when one was given.
 * @returns The override when given, else the vendored copy, else the
 *          system path. This is the one resolution order in the
 *          codebase: every command, the scanner, and the TZif backend
 *          go through it, so a scan and a check never read different
 *          trees.
 * @throws Error when the override does not exist, or when neither a
 *         vendored copy nor a system tree can be found.
 */
export function resolveZoneinfoRoot(explicitRoot?: string): string {
  if (explicitRoot !== undefined) {
    if (!existsSync(explicitRoot)) {
      throw new Error(
        `zoneinfo root does not exist: ${explicitRoot}; point --zoneinfo-root at a ` +
          'directory of compiled TZif files, or omit it to read the copy vendored ' +
          'with cronproof',
      );
    }
    return explicitRoot;
  }
  const vendored = vendoredZoneinfoRoot();
  if (vendored !== null) {
    return vendored;
  }
  if (existsSync(SYSTEM_ZONEINFO_ROOT)) {
    return SYSTEM_ZONEINFO_ROOT;
  }
  throw new Error(
    `no zoneinfo root: no vendored copy was found and ${SYSTEM_ZONEINFO_ROOT} is absent; ` +
      'run "pnpm tzdb:sync <release>" to build one, or pass --zoneinfo-root',
  );
}

/**
 * Reads one zone's TZif file from the root. Rejects zone names that
 * would escape the root. Throws when the file does not exist.
 */
export function readZoneFile(root: string, zone: string): Uint8Array {
  if (zone.includes('..') || path.isAbsolute(zone)) {
    throw new Error(`invalid zone name: ${zone}`);
  }
  return readFileSync(path.join(root, zone));
}

function isTzifFile(filePath: string): boolean {
  try {
    const fd = readFileSync(filePath);
    return (
      fd.length >= 4 &&
      fd[0] === 0x54 &&
      fd[1] === 0x5a &&
      fd[2] === 0x69 &&
      fd[3] === 0x66
    );
  } catch {
    return false;
  }
}

/**
 * Lists every zone under the root whose file starts with the TZif
 * magic, as slash-separated names sorted ascending. Leap-second and
 * duplicate directories are excluded.
 */
export function listZones(root: string): string[] {
  const zones: string[] = [];
  const walk = (relative: string): void => {
    const absolute = path.join(root, relative);
    for (const entry of readdirSync(absolute)) {
      const relPath = relative === '' ? entry : `${relative}/${entry}`;
      if (relative === '' && EXCLUDED_DIRS.has(entry)) {
        continue;
      }
      const absPath = path.join(root, relPath);
      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        walk(relPath);
      } else if (stat.isFile() && isTzifFile(absPath)) {
        zones.push(relPath);
      }
    }
  };
  walk('');
  return zones.sort();
}

/**
 * Reads the tzdb version of a zoneinfo root from its +VERSION file
 * or from the first line of tzdata.zi. Returns null when neither
 * source is present.
 */
export function readZoneinfoVersion(root: string): string | null {
  try {
    return readFileSync(path.join(root, '+VERSION'), 'utf8').trim();
  } catch {
    // fall through to tzdata.zi
  }
  try {
    const firstLine = readFileSync(path.join(root, 'tzdata.zi'), 'utf8').split('\n', 1)[0] ?? '';
    const match = /^#\s*version\s+(\S+)/.exec(firstLine);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
