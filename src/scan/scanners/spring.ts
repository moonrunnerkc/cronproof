/**
 * Spring @Scheduled scanner. Reads the cron attribute and, when
 * present, the zone attribute of a @Scheduled annotation. Spring's cron
 * is a six-field expression (seconds first), so the closest supported
 * dialect is quartz. When the cron value is a property placeholder such
 * as "${my.schedule}", it is reported UNRESOLVED rather than parsed.
 *
 * The zone is explicit only when the annotation sets zone; without it,
 * Spring uses the server's default time zone, which the source does not
 * pin down, so the zone is UNKNOWN. See DECISIONS.md for the cited
 * Spring docs.
 */

import { maskCommentsAndStrings, matchParen } from '../js-lex';
import { LineIndex, looksTemplated } from '../text-locate';
import type { ScanFile, ScheduleFinding, ZoneSource } from '../types';

const CRON_ATTR = /\bcron\s*=\s*"([^"]*)"/;
const ZONE_ATTR = /\bzone\s*=\s*"([^"]*)"/;
const ANNOTATION = /@Scheduled\s*\(/g;

/**
 * Scans a Java/Kotlin source file for @Scheduled cron annotations.
 * @param file The file to scan.
 * @returns One finding per annotation carrying a cron attribute;
 *          fixedRate/fixedDelay annotations are ignored.
 */
export function scanSpring(file: ScanFile): ScheduleFinding[] {
  const masked = maskCommentsAndStrings(file.text);
  const index = new LineIndex(file.text);
  const findings: ScheduleFinding[] = [];
  ANNOTATION.lastIndex = 0;
  let match = ANNOTATION.exec(masked);
  while (match !== null) {
    const openParen = match.index + match[0].length - 1;
    const closeParen = matchParen(masked, openParen);
    const slice = file.text.slice(openParen + 1, closeParen);
    const cronMatch = CRON_ATTR.exec(slice);
    if (cronMatch !== null) {
      const rawCron = cronMatch[1] ?? '';
      const templated = looksTemplated(rawCron);
      const valueOffset = openParen + 1 + cronMatch.index + cronMatch[0].indexOf('"') + 1;
      const position = index.locate(valueOffset);
      const zoneMatch = ZONE_ATTR.exec(slice);
      let zoneSource: ZoneSource;
      if (zoneMatch !== null && !looksTemplated(zoneMatch[1] ?? '') && (zoneMatch[1] ?? '').length > 0) {
        zoneSource = { kind: 'explicit', zone: zoneMatch[1] ?? '' };
      } else {
        zoneSource = { kind: 'unknown' };
      }
      findings.push({
        file: file.path,
        line: position.line,
        column: position.column,
        sourceKind: 'spring-scheduled',
        dialect: 'quartz',
        expression: templated ? null : rawCron,
        resolution: templated ? 'unresolved' : 'resolved',
        zoneSource,
        warnings: [],
      });
    }
    match = ANNOTATION.exec(masked);
  }
  return findings;
}
