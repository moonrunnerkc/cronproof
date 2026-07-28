/**
 * Terraform (HCL) schedule scanner for the two managed cron resources
 * this tool cares about: Google Cloud Scheduler jobs and AWS
 * EventBridge rules/schedules. It locates resource blocks by brace
 * matching, then reads the schedule and zone attributes inside each.
 *
 * Zone rules, cited in DECISIONS.md: a Cloud Scheduler job defaults to
 * Etc/UTC when time_zone is unset; an EventBridge rule is always UTC;
 * an EventBridge Scheduler schedule defaults to UTC unless
 * schedule_expression_timezone is set.
 */

import type { DialectId } from '../../cron/index';
import { LineIndex, findEqualsValues, unquote, type LocatedString } from '../text-locate';
import type { ScanFile, ScheduleFinding, ZoneSource } from '../types';

interface ResourceBlock {
  type: string;
  start: number;
  end: number;
}

function findResourceBlocks(text: string): ResourceBlock[] {
  const blocks: ResourceBlock[] = [];
  const header = /resource\s+"([^"]+)"\s+"[^"]+"\s*\{/g;
  let match = header.exec(text);
  while (match !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 1;
    let i = open + 1;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
      }
      i += 1;
    }
    blocks.push({ type: match[1] ?? '', start: open, end: i });
    match = header.exec(text);
  }
  return blocks;
}

function blockAt(blocks: ResourceBlock[], offset: number): ResourceBlock | null {
  for (const block of blocks) {
    if (offset >= block.start && offset < block.end) {
      return block;
    }
  }
  return null;
}

function firstInBlock(values: LocatedString[], block: ResourceBlock): LocatedString | null {
  for (const value of values) {
    if (value.offset >= block.start && value.offset < block.end) {
      return value;
    }
  }
  return null;
}

function finding(
  file: ScanFile,
  located: LocatedString,
  sourceKind: ScheduleFinding['sourceKind'],
  dialect: DialectId,
  zoneSource: ZoneSource,
): ScheduleFinding {
  return {
    file: file.path,
    line: located.line,
    column: located.column,
    sourceKind,
    dialect,
    expression: unquote(located.value),
    resolution: 'resolved',
    zoneSource,
    warnings: [],
  };
}

/**
 * Scans a Terraform file for Cloud Scheduler and EventBridge schedules.
 * @param file The file to scan.
 * @returns One finding per managed schedule resource, with the zone
 *          resolved from the resource's own attributes or its default.
 */
export function scanTerraform(file: ScanFile): ScheduleFinding[] {
  const index = new LineIndex(file.text);
  const blocks = findResourceBlocks(file.text);
  const schedule = findEqualsValues(index, file.text, 'schedule');
  const scheduleExpr = findEqualsValues(index, file.text, 'schedule_expression');
  const timeZone = findEqualsValues(index, file.text, 'time_zone');
  const exprTimeZone = findEqualsValues(index, file.text, 'schedule_expression_timezone');
  const findings: ScheduleFinding[] = [];

  for (const located of schedule) {
    const block = blockAt(blocks, located.offset);
    if (block?.type !== 'google_cloud_scheduler_job') {
      continue;
    }
    const tz = firstInBlock(timeZone, block);
    const zoneSource: ZoneSource =
      tz === null
        ? { kind: 'platform-default', zone: 'Etc/UTC', rule: 'google_cloud_scheduler_job defaults to Etc/UTC when time_zone is unset' }
        : { kind: 'explicit', zone: unquote(tz.value) };
    findings.push(finding(file, located, 'terraform-cloud-scheduler', 'vixie', zoneSource));
  }

  for (const located of scheduleExpr) {
    const block = blockAt(blocks, located.offset);
    if (block === null) {
      continue;
    }
    if (block.type === 'aws_cloudwatch_event_rule') {
      findings.push(
        finding(file, located, 'terraform-eventbridge', 'aws-eventbridge', {
          kind: 'platform-default',
          zone: 'UTC',
          rule: 'AWS EventBridge rules evaluate cron in UTC',
        }),
      );
    } else if (block.type === 'aws_scheduler_schedule') {
      const tz = firstInBlock(exprTimeZone, block);
      const zoneSource: ZoneSource =
        tz === null
          ? { kind: 'platform-default', zone: 'UTC', rule: 'aws_scheduler_schedule defaults to UTC when schedule_expression_timezone is unset' }
          : { kind: 'explicit', zone: unquote(tz.value) };
      findings.push(finding(file, located, 'terraform-eventbridge', 'aws-eventbridge', zoneSource));
    }
  }
  return findings;
}
