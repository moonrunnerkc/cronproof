/**
 * Application-level JS/TS scanner for node-cron and cron-parser call
 * sites. Rather than a naive regex over raw source, this masks comments
 * and string bodies first, so a call that is commented out or quoted
 * inside another string is not mistaken for a live schedule. Structural
 * paren matching then runs on the masked text, while the schedule
 * string and any tz/timezone option are read from the original text.
 *
 * The zone is explicit only when the call passes a timezone (node-cron
 * `timezone:` or cron-parser `tz:`); otherwise it is UNKNOWN, because
 * both libraries fall back to the host's local time, which the source
 * does not pin down.
 */

import { maskCommentsAndStrings, matchParen } from '../js-lex';
import { LineIndex } from '../text-locate';
import type { ScanFile, ScheduleFinding, SourceKind, ZoneSource } from '../types';

const FIRST_STRING = /['"]([^'"]*)['"]/;
const ZONE_OPTION = /\b(?:tz|timezone)\s*:\s*['"]([^'"]+)['"]/;
const SCHEDULE_SHAPE = /^[@A-Za-z0-9*,/?\-# ]+$/;

/**
 * Cheap filter that keeps the first string argument only when it could
 * be a cron expression or macro, so a date or URL passed as an option
 * before the real expression (when the expression itself is a variable)
 * is not mistaken for a schedule. A full cron expression always has a
 * space between fields, and a macro starts with '@'.
 */
function isScheduleLike(value: string): boolean {
  const trimmed = value.trim();
  if (!SCHEDULE_SHAPE.test(trimmed)) {
    return false;
  }
  return trimmed.startsWith('@') || trimmed.includes(' ');
}

interface CallPattern {
  regex: RegExp;
  sourceKind: SourceKind;
}

const PATTERNS: CallPattern[] = [
  { regex: /\bschedule\s*\(/g, sourceKind: 'node-cron' },
  { regex: /new\s+CronJob\s*\(/g, sourceKind: 'node-cron' },
  { regex: /\bparseExpression\s*\(/g, sourceKind: 'cron-parser' },
  { regex: /CronExpressionParser\s*\.\s*parse\s*\(/g, sourceKind: 'cron-parser' },
];

/**
 * Scans a JS/TS file for node-cron and cron-parser schedule calls.
 * @param file The file to scan.
 * @returns One finding per call whose first argument is a string
 *          literal; calls passing a variable are skipped.
 */
export function scanJsCallsites(file: ScanFile): ScheduleFinding[] {
  const masked = maskCommentsAndStrings(file.text);
  const index = new LineIndex(file.text);
  const findings: ScheduleFinding[] = [];
  const seen = new Set<number>();

  for (const { regex, sourceKind } of PATTERNS) {
    regex.lastIndex = 0;
    let match = regex.exec(masked);
    while (match !== null) {
      const openParen = match.index + match[0].length - 1;
      const closeParen = matchParen(masked, openParen);
      const slice = file.text.slice(openParen + 1, closeParen);
      const stringMatch = FIRST_STRING.exec(slice);
      if (stringMatch !== null && isScheduleLike(stringMatch[1] ?? '')) {
        const valueOffset = openParen + 1 + stringMatch.index;
        if (!seen.has(valueOffset)) {
          seen.add(valueOffset);
          const position = index.locate(valueOffset);
          const zoneMatch = ZONE_OPTION.exec(slice);
          const zoneSource: ZoneSource =
            zoneMatch === null ? { kind: 'unknown' } : { kind: 'explicit', zone: zoneMatch[1] ?? '' };
          findings.push({
            file: file.path,
            line: position.line,
            column: position.column,
            sourceKind,
            dialect: 'vixie',
            expression: stringMatch[1] ?? '',
            resolution: 'resolved',
            zoneSource,
            warnings: [],
          });
        }
      }
      match = regex.exec(masked);
    }
  }
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}
