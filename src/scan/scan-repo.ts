/**
 * Scan orchestrator. Walks a directory (or reads a single file),
 * routes each file to the scanners that apply, and folds inline
 * suppression comments and the .cronproofignore file into the result.
 *
 * A suppression must carry a reason: a reasonless `cronproof-ignore`
 * never silences a finding and is always reported as a diagnostic, so
 * the one thing you cannot do is quietly bury a hazard.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { scannersFor } from './detect';
import { compileIgnore, type IgnoreMatcher } from './glob-ignore';
import { parseSuppressions, suppressionFor } from './suppression';
import type {
  ScanDiagnostic,
  ScanFile,
  ScanResult,
  ScheduleFinding,
  SuppressedFinding,
} from './types';

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}

function readIgnore(root: string): IgnoreMatcher {
  try {
    return compileIgnore(readFileSync(path.join(root, '.cronproofignore'), 'utf8'));
  } catch {
    return compileIgnore('');
  }
}

function walk(root: string, matcher: IgnoreMatcher): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (entry.isDirectory()) {
        if (!matcher.ignores(rel, true)) {
          visit(abs);
        }
      } else if (entry.isFile() && !matcher.ignores(rel, false)) {
        out.push(abs);
      }
    }
  };
  visit(root);
  out.sort();
  return out;
}

interface FileOutcome {
  findings: ScheduleFinding[];
  suppressed: SuppressedFinding[];
  diagnostics: ScanDiagnostic[];
  scanned: boolean;
}

function scanOneFile(file: ScanFile): FileOutcome {
  const scanners = scannersFor(file);
  if (scanners.length === 0) {
    return { findings: [], suppressed: [], diagnostics: [], scanned: false };
  }
  const raw = scanners.flatMap((scanner) => scanner(file));
  const directives = parseSuppressions(file.text);
  const diagnostics: ScanDiagnostic[] = [];
  for (const directive of directives) {
    if (directive.reason === null) {
      diagnostics.push({
        file: file.path,
        line: directive.line,
        code: 'suppression-missing-reason',
        message: 'cronproof-ignore needs a reason: write "cronproof-ignore: why this schedule is safe"',
      });
    }
  }
  const findings: ScheduleFinding[] = [];
  const suppressed: SuppressedFinding[] = [];
  for (const finding of dedupe(raw)) {
    const directive = suppressionFor(directives, finding.line);
    if (directive !== null && directive.reason !== null) {
      suppressed.push({ finding, reason: directive.reason, atLine: directive.line });
    } else {
      findings.push(finding);
    }
  }
  return { findings, suppressed, diagnostics, scanned: true };
}

function dedupe(findings: ScheduleFinding[]): ScheduleFinding[] {
  const seen = new Set<string>();
  const out: ScheduleFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.line}:${finding.column}:${finding.sourceKind}:${finding.expression ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(finding);
    }
  }
  return out;
}

function orderFindings(findings: ScheduleFinding[]): ScheduleFinding[] {
  return [...findings].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
}

/**
 * Scans a repository tree or a single file for schedule declarations.
 * @param target Absolute or relative path to a directory or file.
 * @returns Findings, suppressed findings, diagnostics, and file count,
 *          all in stable order for reproducible output.
 * @throws Error when the target path does not exist.
 */
export function scanRepo(target: string): ScanResult {
  const resolved = path.resolve(target);
  const stat = statSync(resolved);
  const root = stat.isDirectory() ? resolved : path.dirname(resolved);
  const matcher = readIgnore(root);
  const files = stat.isDirectory() ? walk(resolved, matcher) : [resolved];

  const findings: ScheduleFinding[] = [];
  const suppressed: SuppressedFinding[] = [];
  const diagnostics: ScanDiagnostic[] = [];
  let filesScanned = 0;

  for (const abs of files) {
    const relPath = toPosix(path.relative(root, abs));
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (error) {
      diagnostics.push({
        file: relPath,
        line: 0,
        code: 'file-unreadable',
        message: `could not read file: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const outcome = scanOneFile({ path: relPath, absPath: abs, text });
    if (outcome.scanned) {
      filesScanned += 1;
    }
    findings.push(...outcome.findings);
    suppressed.push(...outcome.suppressed);
    diagnostics.push(...outcome.diagnostics);
  }

  return { root, findings: orderFindings(findings), suppressed, diagnostics, filesScanned };
}
