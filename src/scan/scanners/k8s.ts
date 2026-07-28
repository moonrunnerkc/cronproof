/**
 * Kubernetes CronJob scanner. Reads spec.schedule and spec.timeZone
 * from one or more YAML documents in a file, honoring the `---`
 * document separator. It is intentionally line oriented rather than
 * built on a YAML parser, because the more important job here is to
 * refuse to guess: a Helm chart template whose schedule is an
 * unexpanded `{{ ... }}` expression is reported UNRESOLVED, never
 * parsed as if the braces were a literal cron field.
 *
 * When no timeZone is set the zone is UNKNOWN, not assumed UTC: a
 * CronJob without spec.timeZone is interpreted in the time zone of the
 * kube-controller-manager, which is a cluster property this file
 * cannot reveal. See DECISIONS.md for the cited Kubernetes docs.
 */

import { looksTemplated, unquote } from '../text-locate';
import type { ScanFile, ScheduleFinding, ZoneSource } from '../types';

const SCHEDULE_LINE = /^(\s*schedule\s*:\s*)(.+?)\s*$/;
const TIMEZONE_LINE = /^\s*timeZone\s*:\s*(.+?)\s*$/;
const CRONJOB_MARKER = /\bkind\s*:\s*["']?CronJob\b|\bjobTemplate\s*:/;

function stripInlineComment(raw: string): string {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return raw;
  }
  const hash = raw.indexOf(' #');
  return hash === -1 ? raw : raw.slice(0, hash);
}

interface DocLine {
  index: number;
  text: string;
}

interface Doc {
  lines: DocLine[];
}

function splitDocuments(text: string): Doc[] {
  const docs: Doc[] = [];
  let current: DocLine[] = [];
  const all = text.split('\n');
  for (let i = 0; i < all.length; i += 1) {
    const text_i = all[i] ?? '';
    if (/^---\s*$/.test(text_i)) {
      docs.push({ lines: current });
      current = [];
      continue;
    }
    current.push({ index: i, text: text_i });
  }
  docs.push({ lines: current });
  return docs;
}

function zoneFromDoc(doc: Doc): ZoneSource {
  for (const line of doc.lines) {
    const match = TIMEZONE_LINE.exec(line.text);
    if (match === null) {
      continue;
    }
    const raw = stripInlineComment(match[1] ?? '');
    if (looksTemplated(raw)) {
      return { kind: 'unknown' };
    }
    return { kind: 'explicit', zone: unquote(raw) };
  }
  return { kind: 'unknown' };
}

function scheduleFindings(file: ScanFile, doc: Doc, zoneSource: ZoneSource): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  for (const line of doc.lines) {
    const match = SCHEDULE_LINE.exec(line.text);
    if (match === null) {
      continue;
    }
    const prefix = match[1] ?? '';
    const rawValue = stripInlineComment(match[2] ?? '');
    const templated = looksTemplated(rawValue);
    const warnings: string[] = [];
    if (zoneSource.kind === 'unknown' && !templated) {
      warnings.push('no spec.timeZone: schedule runs in the controller-manager zone, which is not knowable from source');
    }
    findings.push({
      file: file.path,
      line: line.index + 1,
      column: prefix.length + 1,
      sourceKind: 'k8s-cronjob',
      dialect: 'k8s',
      expression: templated ? null : unquote(rawValue),
      resolution: templated ? 'unresolved' : 'resolved',
      zoneSource: templated && zoneSource.kind !== 'explicit' ? { kind: 'unknown' } : zoneSource,
      warnings,
    });
  }
  return findings;
}

/**
 * Scans a YAML file for Kubernetes CronJob schedules.
 * @param file The file to scan.
 * @returns One finding per CronJob schedule, with unresolved Helm
 *          templates flagged rather than parsed.
 */
export function scanK8s(file: ScanFile): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  for (const doc of splitDocuments(file.text)) {
    const joined = doc.lines.map((line) => line.text).join('\n');
    if (!CRONJOB_MARKER.test(joined)) {
      continue;
    }
    findings.push(...scheduleFindings(file, doc, zoneFromDoc(doc)));
  }
  return findings;
}
