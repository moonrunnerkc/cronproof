/**
 * Machine-checked claim and number provenance. Every external claim in
 * README.md, docs/, and FINDINGS.md must carry a source in
 * docs/provenance.json: a URL, a stored snapshot under docs/sources/
 * with a pinned sha256, and an anchor string that appears in the
 * snapshot and supports the claim. Every measured number in prose must
 * carry an origin the checker can resolve to EVIDENCE.md, the research
 * report, or a test name. A gap (an uncited URL, an untraceable number,
 * a moved hash, a missing anchor) fails. Live drift from a snapshot is a
 * warning, because a page changing under a claim is itself a finding.
 *
 * Run `pnpm check-claims`. Run `pnpm check-claims --update` to (re)fetch
 * snapshots and write their hashes back into the registry.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOC_FILES,
  loadRegistry,
  proseNumbers,
  proseUrls,
  saveRegistry,
  SOURCES_DIR,
  traceNumber,
  type Registry,
} from './claims-support';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Line {
  ok: boolean;
  text: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'user-agent': 'Mozilla/5.0 cronproof-claim-check' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status >= 200 && response.status < 400) {
        return await response.text();
      }
    } catch {
      // fall through to retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return null;
}

async function update(registry: Registry): Promise<void> {
  mkdirSync(path.join(REPO_ROOT, SOURCES_DIR), { recursive: true });
  for (const claim of registry.claims) {
    const url = claim.fetchUrl ?? claim.url;
    const body = await fetchText(url);
    if (body === null) {
      process.stderr.write(`[update] could not fetch ${url}\n`);
      continue;
    }
    if (!body.includes(claim.anchor)) {
      process.stderr.write(`[update] anchor not found in ${url}: ${JSON.stringify(claim.anchor)}\n`);
      continue;
    }
    writeFileSync(path.join(REPO_ROOT, SOURCES_DIR, claim.snapshot), body, 'utf8');
    claim.sha256 = sha256(body);
    process.stdout.write(`[update] ${claim.snapshot} <- ${url} (${body.length} bytes)\n`);
  }
  saveRegistry(REPO_ROOT, registry);
}

async function verifyClaims(registry: Registry): Promise<Line[]> {
  const lines: Line[] = [];
  for (const claim of registry.claims) {
    const file = path.join(REPO_ROOT, SOURCES_DIR, claim.snapshot);
    if (!existsSync(file)) {
      lines.push({ ok: false, text: `claim ${claim.url}: snapshot ${claim.snapshot} missing (run --update)` });
      continue;
    }
    const snapshot = readFileSync(file, 'utf8');
    if (sha256(snapshot) !== claim.sha256) {
      lines.push({ ok: false, text: `claim ${claim.url}: snapshot hash mismatch` });
      continue;
    }
    if (!snapshot.includes(claim.anchor)) {
      lines.push({ ok: false, text: `claim ${claim.url}: anchor absent from snapshot: ${JSON.stringify(claim.anchor)}` });
      continue;
    }
    const resolves = (await fetchText(claim.url)) !== null;
    if (!resolves) {
      lines.push({ ok: false, text: `claim ${claim.url}: url did not resolve` });
      continue;
    }
    // Drift compares the anchor against the same content that was snapshotted
    // (the raw source, when a fetchUrl is set), not a JS-rendered viewer page.
    const live = await fetchText(claim.fetchUrl ?? claim.url);
    const drift = live !== null && !live.includes(claim.anchor);
    lines.push({
      ok: true,
      text: `claim ${claim.url}: ok${drift ? ' (WARNING: anchor no longer on live page, snapshot may be stale)' : ''}`,
    });
  }
  return lines;
}

function verifyCoverage(registry: Registry): { lines: Line[]; claims: number; numbers: number } {
  const lines: Line[] = [];
  const knownUrls = new Set(registry.claims.map((c) => c.url));
  const skip = new Set(registry.claimSkiplist);
  let claimGaps = 0;
  let numberGaps = 0;
  const seenNumbers = new Set<string>();

  for (const file of DOC_FILES) {
    const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    for (const url of proseUrls(text)) {
      if (skip.has(url) || knownUrls.has(url)) {
        continue;
      }
      claimGaps += 1;
      lines.push({ ok: false, text: `${file}: uncited external URL (no provenance entry): ${url}` });
    }
    for (const num of proseNumbers(text, registry.numberAllowlist)) {
      const key = `${num}`;
      const registered = registry.numbers.find((n) => n.value === num);
      if (registered === undefined) {
        numberGaps += 1;
        lines.push({ ok: false, text: `${file}: untraceable measured number in prose: ${JSON.stringify(num)}` });
      } else if (!seenNumbers.has(key)) {
        seenNumbers.add(key);
      }
    }
  }
  return { lines, claims: claimGaps, numbers: numberGaps };
}

function verifyNumbers(registry: Registry): Line[] {
  return registry.numbers.map((entry) => {
    const resolved = traceNumber(REPO_ROOT, entry);
    return {
      ok: resolved,
      text: `number ${JSON.stringify(entry.value)} (${entry.origin}: ${entry.find}): ${resolved ? 'traced' : 'NOT FOUND at origin'}`,
    };
  });
}

async function main(): Promise<number> {
  const registry = loadRegistry(REPO_ROOT);
  if (process.argv.includes('--update')) {
    await update(registry);
    return 0;
  }

  const claimLines = await verifyClaims(registry);
  const numberLines = verifyNumbers(registry);
  const coverage = verifyCoverage(registry);
  const all = [...claimLines, ...numberLines, ...coverage.lines];
  for (const line of all) {
    process.stdout.write(`${line.ok ? 'OK  ' : 'FAIL'}  ${line.text}\n`);
  }

  const claimsVerified = claimLines.filter((l) => l.ok).length;
  const numbersTraced = numberLines.filter((l) => l.ok).length;
  process.stdout.write('\ncoverage summary\n');
  process.stdout.write(`  claims:  ${registry.claims.length} total, ${claimsVerified} sources verified, ${coverage.claims} uncited in prose\n`);
  process.stdout.write(`  numbers: ${registry.numbers.length} registered, ${numbersTraced} traced, ${coverage.numbers} untraceable in prose\n`);

  const failed = all.filter((l) => !l.ok).length;
  return failed === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`check-claims crashed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
