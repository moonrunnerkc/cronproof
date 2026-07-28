/**
 * GitHub Actions schedule scanner. Reads on.schedule.cron entries. The
 * platform runs every scheduled workflow in UTC with no timezone knob,
 * so the usual finding is "safe, UTC". The value this scanner adds is
 * the mismatch case: when a nearby comment or the workflow/job name
 * implies a local wall-clock intent (midnight, 9am, a zone abbrev), the
 * schedule is almost certainly off by the author's UTC offset, so the
 * finding carries a warning. See DECISIONS.md for the cited docs on the
 * UTC rule.
 */

import { unquote } from '../text-locate';
import type { ScanFile, ScheduleFinding } from '../types';

const CRON_LINE = /^(\s*(?:-\s*)?cron\s*:\s*)(.+?)\s*$/;
const LOCAL_INTENT =
  /\b(local|localtime|midnight|noon|morning|evening|overnight|[0-9]{1,2}\s*(?:am|pm)|[ECMP][SD]T|[A-Z]{3,4}\s*time|[A-Za-z]+\/[A-Za-z_]+)\b/i;

function commentOf(line: string): string {
  const hash = line.indexOf('#');
  return hash === -1 ? '' : line.slice(hash + 1);
}

const NAME_LINE = /^\s*name\s*:\s*(.+?)\s*$/;

/**
 * Builds the text a local-intent check looks at for one cron line: its
 * own inline comment, the contiguous comment block directly above it,
 * and the nearest enclosing name value. A comment two lines up behind
 * an unrelated cron line does not count, so only the schedule the
 * comment actually annotates is warned.
 */
function intentContext(lines: string[], index: number): string {
  const parts: string[] = [commentOf(lines[index] ?? '')];
  for (let back = index - 1; back >= 0; back -= 1) {
    const prior = lines[back];
    if (prior === undefined || prior.trim().startsWith('#')) {
      parts.push(prior ?? '');
    } else {
      break;
    }
  }
  for (let back = index - 1; back >= 0 && back >= index - 12; back -= 1) {
    const nameMatch = NAME_LINE.exec(lines[back] ?? '');
    if (nameMatch !== null) {
      parts.push(nameMatch[1] ?? '');
      break;
    }
  }
  return parts.join(' \n ');
}

/**
 * Scans a workflow YAML file for on.schedule.cron entries.
 * @param file The file to scan.
 * @returns One UTC finding per cron entry, warned when a comment or
 *          name nearby implies local-time intent.
 */
export function scanGithubActions(file: ScanFile): ScheduleFinding[] {
  const findings: ScheduleFinding[] = [];
  const lines = file.text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const match = CRON_LINE.exec(line);
    if (match === null) {
      continue;
    }
    const prefix = match[1] ?? '';
    const valuePart = (match[2] ?? '').replace(/\s+#.*$/, '');
    const warnings: string[] = [];
    if (LOCAL_INTENT.test(intentContext(lines, i))) {
      warnings.push('nearby comment or name implies local-time intent, but GitHub Actions runs this schedule in UTC');
    }
    findings.push({
      file: file.path,
      line: i + 1,
      column: prefix.length + 1,
      sourceKind: 'github-actions',
      dialect: 'github-actions',
      expression: unquote(valuePart),
      resolution: 'resolved',
      zoneSource: { kind: 'platform-default', zone: 'UTC', rule: 'GitHub Actions runs scheduled workflows in UTC' },
      warnings,
    });
  }
  return findings;
}
