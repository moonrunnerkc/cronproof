/**
 * Support for check-claims: the provenance registry schema, extraction
 * of external URLs and measured numbers from prose, and resolution of a
 * number to its origin (EVIDENCE.md, the research report, or a test).
 * Number matching is by a normalized key (digits plus a unit category)
 * so the registry does not depend on the exact prose wording.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Where fetched source snapshots live, relative to the repo root. */
export const SOURCES_DIR = 'docs/sources';

/** The documents whose claims and numbers are checked. */
export const DOC_FILES = ['README.md', 'docs/dst-semantics.md', 'docs/policy-models.md', 'FINDINGS.md'];

/** A claim: an external URL backed by a stored, hashed snapshot. */
export interface Claim {
  /** The URL as cited in the docs (checked to resolve). */
  url: string;
  /** Optional different URL to snapshot (for example a raw source file). */
  fetchUrl?: string;
  /** Snapshot filename under docs/sources/. */
  snapshot: string;
  /** sha256 of the snapshot, written by --update. */
  sha256: string;
  /** A substring that must appear in the snapshot and supports the claim. */
  anchor: string;
  /** ISO date the snapshot was fetched. */
  fetchedAt: string;
}

/** A measured number in prose and where it comes from. */
export interface NumberRef {
  /** Normalized key: digits, a colon, and a unit category. */
  value: string;
  /** Which artifact the number is traced to. */
  origin: 'evidence' | 'report' | 'test' | 'claim';
  /** A line substring that must appear in the origin and contain the digits. */
  find: string;
}

/** The full provenance registry. */
export interface Registry {
  /** External claims with snapshots. */
  claims: Claim[];
  /** Measured numbers with origins. */
  numbers: NumberRef[];
  /** URLs that are not factual claims (badges, this repo's own links). */
  claimSkiplist: string[];
  /** Regex sources for prose numbers that do not need provenance. */
  numberAllowlist: string[];
}

const REGISTRY_FILE = 'docs/provenance.json';

/** Reads the provenance registry. */
export function loadRegistry(repoRoot: string): Registry {
  return JSON.parse(readFileSync(path.join(repoRoot, REGISTRY_FILE), 'utf8')) as Registry;
}

/** Writes the provenance registry back, pretty-printed. */
export function saveRegistry(repoRoot: string, registry: Registry): void {
  writeFileSync(path.join(repoRoot, REGISTRY_FILE), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
}

/** Every external http(s) URL cited in prose, deduped. */
export function proseUrls(text: string): string[] {
  const urls = new Set<string>();
  const pattern = /https?:\/\/[^\s)"'\]]+/g;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    urls.add(m[0].replace(/[).,;]+$/, ''));
  }
  return [...urls];
}

const UNIT_CATEGORY: Record<string, string> = {
  min: 'min', mins: 'min',
  minute: 'minute', minutes: 'minute',
  second: 'second', seconds: 'second',
  hour: 'hour', hours: 'hour',
  kib: 'kib', bytes: 'byte', byte: 'byte',
  missed: 'missed', transitions: 'transition', transition: 'transition',
};

/**
 * Every measured number in prose, as normalized keys (digits, colon,
 * unit category). Covers fractions, percentages, number-with-adjacent
 * unit, and "N ... transitions". Numbers matching an allowlist pattern
 * are structural (years, versions, times, offsets, and similar) and are
 * not returned.
 */
export function proseNumbers(text: string, allowlist: string[]): string[] {
  const body = stripCode(text).replace(/https?:\/\/\S+/g, ' ');
  const allowed = allowlist.map((source) => new RegExp(source));
  const keys = new Set<string>();
  const isYear = (digits: string): boolean => /^(?:19|20)\d{2}$/.test(digits);
  // A number after one of these labels is a reference, not a measured value.
  const labeled = (index: number): boolean =>
    /\b(section|phase|finding|stage|item|rule|step|part|figure|table)\s*$/i.test(
      body.slice(Math.max(0, index - 16), index),
    );
  const add = (raw: string, key: string, index: number): void => {
    const digits = (key.split(':')[0] ?? '').replace(/[^0-9]/g, '');
    if (isYear(digits) || labeled(index) || allowed.some((re) => re.test(raw))) {
      return;
    }
    keys.add(key);
  };

  for (const m of body.matchAll(/\b\d+\/\d+\b/g)) {
    add(m[0], m[0], m.index ?? 0);
  }
  for (const m of body.matchAll(/\b\d+(?:\.\d+)?%/g)) {
    add(m[0], m[0], m.index ?? 0);
  }
  for (const m of body.matchAll(/\b(\d[\d,]*)[ -]?(mins?|minutes?|seconds?|hours?|KiB|bytes?|missed)\b/gi)) {
    const digits = (m[1] ?? '').replace(/,/g, '');
    const unit = UNIT_CATEGORY[(m[2] ?? '').toLowerCase()] ?? (m[2] ?? '').toLowerCase();
    add(m[0], `${digits}:${unit}`, m.index ?? 0);
  }
  for (const m of body.matchAll(/\b(\d[\d,]*)\s+(?:[A-Za-z_/]+\s+){0,2}transitions?\b/g)) {
    const digits = (m[1] ?? '').replace(/,/g, '');
    add(m[0], `${digits}:transition`, m.index ?? 0);
  }
  return [...keys];
}

function testFilesContain(repoRoot: string, needle: string): boolean {
  const walk = (dir: string): boolean => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(full)) {
          return true;
        }
      } else if (entry.name.endsWith('.test.ts') && readFileSync(full, 'utf8').includes(needle)) {
        return true;
      }
    }
    return false;
  };
  return walk(path.join(repoRoot, 'tests'));
}

/** True when the number's `find` string appears in its origin artifact. */
export function traceNumber(repoRoot: string, entry: NumberRef): boolean {
  const digits = entry.value.split(':')[0] ?? entry.value;
  if (!entry.find.includes(digits)) {
    return false;
  }
  if (entry.origin === 'test') {
    return testFilesContain(repoRoot, entry.find);
  }
  if (entry.origin === 'claim') {
    const dir = path.join(repoRoot, SOURCES_DIR);
    return readdirSync(dir).some((name) => readFileSync(path.join(dir, name), 'utf8').includes(entry.find));
  }
  const files =
    entry.origin === 'evidence'
      ? ['EVIDENCE.md']
      : ['research/out/report.md', 'research/out/metrics.json'];
  return files.some((file) => {
    try {
      return readFileSync(path.join(repoRoot, file), 'utf8').includes(entry.find);
    } catch {
      return false;
    }
  });
}
