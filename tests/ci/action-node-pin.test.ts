import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { tzdbVersions, vendoredZoneinfoRoot } from '../../src/tz/index';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('the action runs on the Node release the vendored tzdb was pinned against', () => {
  test('action.yml pins the exact version in .nvmrc, not a major range', () => {
    const pinned = read('.nvmrc').trim();
    const match = /node-version:\s*"([^"]+)"/.exec(read('action/action.yml'));
    expect(match?.[1]).toBe(pinned);
    // A bare major would let the runner pick any 22.x, and the ICU tzdb
    // changes within a major, which is the drift this pin exists to stop.
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('the running Node ICU tzdb matches the vendored zoneinfo release', () => {
    const root = vendoredZoneinfoRoot();
    expect(root).not.toBeNull();
    const versions = tzdbVersions(root ?? undefined);
    expect(versions.intlTzdbVersion).toBe(versions.zoneinfoTzdbVersion);
  });
});
