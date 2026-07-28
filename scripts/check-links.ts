/**
 * Link checker for the documentation. It extracts every link and image
 * target from README.md and docs/*.md, then verifies each one resolves:
 * an external http(s) URL must return a non-error status, a relative
 * path must point at a file that exists, and a same-file "#anchor" must
 * match a heading. It exits non-zero if any link fails, so a broken
 * reference cannot land in the docs unnoticed.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FILES = ['README.md', 'docs/dst-semantics.md', 'docs/policy-models.md'];

interface Link {
  file: string;
  target: string;
}

interface Result {
  file: string;
  target: string;
  ok: boolean;
  detail: string;
}

/** Extracts every `](target)` link and image target from markdown text. */
function extractLinks(file: string, text: string): Link[] {
  const links: Link[] = [];
  const pattern = /\]\(\s*([^)\s]+?)\s*(?:\s+"[^"]*")?\)/g;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const target = match[1];
    if (target !== undefined && !target.startsWith('mailto:')) {
      links.push({ file, target });
    }
  }
  return links;
}

/** Slugifies a heading the way GitHub does, for anchor validation. */
function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function headingSlugs(text: string): Set<string> {
  const slugs = new Set<string>();
  for (const line of text.split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match?.[1] !== undefined) {
      slugs.add(slug(match[1]));
    }
  }
  return slugs;
}

async function checkExternal(url: string): Promise<{ ok: boolean; detail: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 cronproof-link-check', accept: '*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status >= 200 && response.status < 400) {
        return { ok: true, detail: String(response.status) };
      }
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
      return { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      if (attempt === 2) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  return { ok: false, detail: 'exhausted retries' };
}

function checkRelative(file: string, target: string, slugsByFile: Map<string, Set<string>>): { ok: boolean; detail: string } {
  const hashIndex = target.indexOf('#');
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const anchor = hashIndex === -1 ? undefined : target.slice(hashIndex + 1);
  if (rawPath === '') {
    const slugs = slugsByFile.get(file);
    const ok = anchor !== undefined && slugs !== undefined && slugs.has(anchor);
    return { ok, detail: ok ? 'anchor' : `missing anchor #${anchor ?? ''}` };
  }
  const resolved = path.resolve(REPO_ROOT, path.dirname(file), rawPath);
  const ok = existsSync(resolved);
  return { ok, detail: ok ? 'file' : `missing file ${rawPath}` };
}

async function main(): Promise<number> {
  const slugsByFile = new Map<string, Set<string>>();
  const links: Link[] = [];
  for (const file of FILES) {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    slugsByFile.set(file, headingSlugs(text));
    links.push(...extractLinks(file, text));
  }

  const results: Result[] = [];
  for (const link of links) {
    const isExternal = /^https?:\/\//.test(link.target);
    const outcome = isExternal
      ? await checkExternal(link.target)
      : checkRelative(link.file, link.target, slugsByFile);
    results.push({ file: link.file, target: link.target, ...outcome });
    process.stdout.write(`${outcome.ok ? 'OK  ' : 'FAIL'}  ${link.file}  ${link.target}  (${outcome.detail})\n`);
  }

  const failed = results.filter((result) => !result.ok);
  process.stdout.write(`\nchecked ${results.length} links across ${FILES.length} files, ${failed.length} failed\n`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`link check crashed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
