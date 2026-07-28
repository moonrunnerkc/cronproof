/**
 * Celery beat scanner. Finds celery.schedules.crontab(...) entries and
 * reconstructs the equivalent five-field cron expression from the
 * keyword arguments (minute, hour, day_of_month, month_of_year,
 * day_of_week), defaulting any omitted field to "*" as Celery does.
 *
 * Celery interprets these against the app's configured timezone
 * (timezone / CELERY_TIMEZONE), an app-level setting the call site does
 * not carry, so the zone is UNKNOWN. See DECISIONS.md for the cited
 * Celery docs on crontab defaults and the timezone setting.
 */

import { LineIndex } from '../text-locate';
import type { ScanFile, ScheduleFinding } from '../types';

const CALL = /\bcrontab\s*\(/g;
const FIELDS = ['minute', 'hour', 'day_of_month', 'month_of_year', 'day_of_week'] as const;

function matchParenPython(text: string, openParen: number): number {
  let depth = 0;
  let quote = '';
  for (let i = openParen; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== '') {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return text.length;
}

function fieldValue(slice: string, name: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*('[^']*'|"[^"]*"|[^,)\\n]+)`);
  const match = pattern.exec(slice);
  if (match === null) {
    return '*';
  }
  const raw = (match[1] ?? '').trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function lineIsComment(text: string, offset: number): boolean {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  return before.includes('#');
}

/**
 * Scans a Python file for Celery beat crontab entries.
 * @param file The file to scan.
 * @returns One finding per crontab() call, cron rebuilt from kwargs,
 *          zone UNKNOWN because it comes from the app configuration.
 */
export function scanCelery(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  const findings: ScheduleFinding[] = [];
  CALL.lastIndex = 0;
  let match = CALL.exec(file.text);
  while (match !== null) {
    const identOffset = match.index;
    if (lineIsComment(file.text, identOffset)) {
      match = CALL.exec(file.text);
      continue;
    }
    const openParen = match.index + match[0].length - 1;
    const closeParen = matchParenPython(file.text, openParen);
    const slice = file.text.slice(openParen + 1, closeParen);
    const expression = FIELDS.map((field) => fieldValue(slice, field)).join(' ');
    const position = index.locate(identOffset);
    findings.push({
      file: file.path,
      line: position.line,
      column: position.column,
      sourceKind: 'celery-beat',
      dialect: 'vixie',
      expression,
      resolution: 'resolved',
      zoneSource: { kind: 'unknown' },
      warnings: [],
    });
    match = CALL.exec(file.text);
  }
  return findings;
}
