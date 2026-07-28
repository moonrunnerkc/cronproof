import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { scanRepo, type ScheduleFinding, type SourceKind } from '../../src/scan/index';

const FIXTURE = fileURLToPath(new URL('./fixture', import.meta.url));
const result = scanRepo(FIXTURE);

function at(file: string, line: number): ScheduleFinding {
  const finding = result.findings.find((f) => f.file === file && f.line === line);
  if (finding === undefined) {
    throw new Error(`no finding at ${file}:${line}`);
  }
  return finding;
}

describe('scanning a repo with every supported source type', () => {
  test('locates at least one schedule for each of the fourteen source kinds', () => {
    const kinds = new Set<SourceKind>(result.findings.map((f) => f.sourceKind));
    expect([...kinds].sort()).toEqual(
      [
        'celery-beat',
        'cron-parser',
        'crontab',
        'github-actions',
        'k8s-cronjob',
        'netlify',
        'node-cron',
        'render',
        'spring-scheduled',
        'systemd-timer',
        'terraform-cloud-scheduler',
        'terraform-eventbridge',
        'vercel',
        'wrangler',
      ].sort(),
    );
  });

  test('records the exact file, line, and column for a crontab entry', () => {
    const finding = at('app.crontab', 3);
    expect(finding.column).toBe(1);
    expect(finding.expression).toBe('15 2 * * *');
    expect(finding.sourceKind).toBe('crontab');
  });

  test('records the column of a quoted YAML schedule value at the opening quote', () => {
    const finding = at('k8s/cronjobs.yaml', 6);
    expect(finding.column).toBe(13);
    expect(finding.expression).toBe('0 2 * * *');
  });

  test('records the column of a JS call-site schedule literal', () => {
    const finding = at('app/jobs.ts', 5);
    expect(finding.sourceKind).toBe('node-cron');
    expect(finding.column).toBe(15);
    expect(finding.expression).toBe('0 30 9 * * *');
  });

  test('records the column of a systemd OnCalendar value', () => {
    const finding = at('systemd/backup.timer', 5);
    expect(finding.column).toBe(12);
    expect(finding.expression).toBe('*-*-* 02:30:00');
  });
});

describe('zone source provenance', () => {
  test('a k8s CronJob timeZone is reported as an explicit zone', () => {
    expect(at('k8s/cronjobs.yaml', 6).zoneSource).toEqual({
      kind: 'explicit',
      zone: 'America/Los_Angeles',
    });
  });

  test('GitHub Actions schedules are a platform default of UTC', () => {
    const finding = at('.github/workflows/nightly.yml', 5);
    expect(finding.zoneSource.kind).toBe('platform-default');
    expect(finding.zoneSource).toMatchObject({ zone: 'UTC' });
  });

  test('a systemd OnCalendar with no zone and no unit Timezone is UNKNOWN', () => {
    expect(at('systemd/backup.timer', 6).zoneSource).toEqual({ kind: 'unknown' });
  });

  test('a Cloud Scheduler job without time_zone defaults to Etc/UTC', () => {
    expect(at('infra/schedules.tf', 13).zoneSource).toMatchObject({
      kind: 'platform-default',
      zone: 'Etc/UTC',
    });
  });
});

describe('CRON_TZ inheritance', () => {
  test('an entry before any CRON_TZ has an unknown zone', () => {
    expect(at('app.crontab', 3).zoneSource).toEqual({ kind: 'unknown' });
  });

  test('an entry after CRON_TZ inherits that zone and cites the line it came from', () => {
    expect(at('app.crontab', 6).zoneSource).toEqual({
      kind: 'inherited',
      zone: 'America/New_York',
      fromLine: 4,
      via: 'CRON_TZ',
    });
  });

  test('a mid-file CRON_TZ redeclaration affects only the entries after it', () => {
    expect(at('app.crontab', 9).zoneSource).toEqual({
      kind: 'inherited',
      zone: 'Europe/Berlin',
      fromLine: 7,
      via: 'CRON_TZ',
    });
  });
});

describe('unresolvable templates', () => {
  test('a Helm-templated schedule is reported UNRESOLVED, never parsed', () => {
    const finding = at('k8s/templates/cronjob.yaml', 6);
    expect(finding.resolution).toBe('unresolved');
    expect(finding.expression).toBeNull();
  });

  test('a Spring property placeholder cron is reported UNRESOLVED', () => {
    const finding = at('app/ScheduledTasks.java', 20);
    expect(finding.resolution).toBe('unresolved');
    expect(finding.expression).toBeNull();
  });
});

describe('the JS call-site pass ignores non-live code', () => {
  test('only the three real call sites are found, not the commented or quoted ones', () => {
    const lines = result.findings
      .filter((f) => f.file === 'app/jobs.ts')
      .map((f) => f.line)
      .sort((a, b) => a - b);
    expect(lines).toEqual([5, 8, 11]);
  });

  test('a cron-parser tz option is read as an explicit zone', () => {
    expect(at('app/jobs.ts', 11).zoneSource).toEqual({ kind: 'explicit', zone: 'Europe/Berlin' });
  });
});

describe('local-intent warnings on always-UTC platforms', () => {
  test('a cron annotated by a local-time comment is warned', () => {
    expect(at('.github/workflows/nightly.yml', 5).warnings.length).toBeGreaterThan(0);
  });

  test('a cron with no local-time hint above it is not warned', () => {
    expect(at('.github/workflows/nightly.yml', 6).warnings).toEqual([]);
  });
});
