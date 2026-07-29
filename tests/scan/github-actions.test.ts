import { describe, expect, test } from 'vitest';
import { scanGithubActions } from '../../src/scan/scanners/github-actions';
import type { ScanContext, ScheduleFinding } from '../../src/scan/types';
import { listZones, resolveZoneinfoRoot } from '../../src/tz/index';

const ZONES: ReadonlySet<string> = new Set(listZones(resolveZoneinfoRoot()));
const context: ScanContext = { knownZones: () => ZONES };

function scan(text: string): ScheduleFinding[] {
  return scanGithubActions(
    { path: '.github/workflows/w.yml', absPath: '/w.yml', text },
    context,
  );
}

function only(text: string): ScheduleFinding {
  const findings = scan(text);
  expect(findings).toHaveLength(1);
  const first = findings[0];
  if (first === undefined) {
    throw new Error('no finding');
  }
  return first;
}

describe('reading the timezone a workflow declares for its schedule', () => {
  test('a schedule with no timezone key runs in the platform default of UTC', () => {
    expect(only('on:\n  schedule:\n    - cron: "0 3 * * *"\n').zoneSource).toMatchObject({
      kind: 'platform-default',
      zone: 'UTC',
    });
  });

  test('a timezone written beside the cron is the schedule s explicit zone', () => {
    const finding = only(
      'on:\n  schedule:\n    - cron: "30 2 * * *"\n      timezone: America/New_York\n',
    );
    expect(finding.zoneSource).toEqual({ kind: 'explicit', zone: 'America/New_York' });
  });

  test('a timezone written before its cron in the same item is still read', () => {
    const finding = only(
      'on:\n  schedule:\n    - timezone: Europe/Berlin\n      cron: "0 1 * * *"\n',
    );
    expect(finding.zoneSource).toEqual({ kind: 'explicit', zone: 'Europe/Berlin' });
  });

  test('a quoted timezone value is read without its quotes', () => {
    const finding = only(
      'on:\n  schedule:\n    - cron: "0 1 * * *"\n      timezone: "Asia/Tokyo"\n',
    );
    expect(finding.zoneSource).toEqual({ kind: 'explicit', zone: 'Asia/Tokyo' });
  });

  test('a later item s timezone does not leak onto an earlier undeclared schedule', () => {
    const findings = scan(
      'on:\n' +
        '  schedule:\n' +
        '    - cron: "0 4 * * *"\n' +
        '    - cron: "0 5 * * *"\n' +
        '      timezone: America/Denver\n',
    );
    expect(findings.map((f) => f.zoneSource)).toEqual([
      { kind: 'platform-default', zone: 'UTC', rule: expect.any(String) },
      { kind: 'explicit', zone: 'America/Denver' },
    ]);
  });

  test('an earlier item s timezone does not leak onto a later undeclared schedule', () => {
    const findings = scan(
      'on:\n' +
        '  schedule:\n' +
        '    - cron: "0 4 * * *"\n' +
        '      timezone: America/Denver\n' +
        '    - cron: "0 5 * * *"\n',
    );
    expect(findings.map((f) => f.zoneSource)).toEqual([
      { kind: 'explicit', zone: 'America/Denver' },
      { kind: 'platform-default', zone: 'UTC', rule: expect.any(String) },
    ]);
  });

  test('a timezone nested under another key is not read as the schedule s zone', () => {
    const finding = only(
      'on:\n' +
        '  schedule:\n' +
        '    - cron: "0 6 * * *"\n' +
        '      inputs:\n' +
        '        timezone: America/Chicago\n',
    );
    expect(finding.zoneSource).toMatchObject({ kind: 'platform-default', zone: 'UTC' });
  });

  test('a misspelled zone is reported UNKNOWN with the correction to make', () => {
    const finding = only(
      'on:\n  schedule:\n    - cron: "0 2 * * *"\n      timezone: America/New_Yrok\n',
    );
    expect(finding.zoneSource).toEqual({ kind: 'unknown' });
    expect(finding.warnings.join(' ')).toContain('America/New_Yrok');
  });

  test('an unexpanded expression in the timezone leaves the zone unknown', () => {
    const finding = only(
      'on:\n  schedule:\n    - cron: "0 2 * * *"\n      timezone: ${{ vars.TZ }}\n',
    );
    expect(finding.zoneSource).toEqual({ kind: 'unknown' });
    expect(finding.warnings.join(' ')).toContain('template');
  });

  test('a schedule that declares its zone is not warned about local-time intent', () => {
    const finding = only(
      'on:\n' +
        '  schedule:\n' +
        '    # run at local midnight for the ops team\n' +
        '    - cron: "0 0 * * *"\n' +
        '      timezone: America/New_York\n',
    );
    expect(finding.warnings).toEqual([]);
  });
});

describe('warning only when prose really claims a local wall clock', () => {
  const warn = (comment: string): string[] =>
    only(`on:\n  schedule:\n    # ${comment}\n    - cron: "0 0 * * *"\n`).warnings;

  test('an ordinary word ending in time is not a timezone abbreviation', () => {
    expect(warn('runs during daytime so nobody notices')).toEqual([]);
    expect(warn('Showtime for the release build')).toEqual([]);
    expect(warn('takes about the time of a coffee')).toEqual([]);
  });

  test('a European or Asian abbreviation is recognized, not only American ones', () => {
    expect(warn('nightly build at 2am CET')).not.toEqual([]);
    expect(warn('runs 09:00 JST for the Tokyo team')).not.toEqual([]);
    expect(warn('kicked off 6am AEST')).not.toEqual([]);
  });

  test('an upper-case abbreviation followed by the word time is recognized', () => {
    expect(warn('scheduled for 3 EST time')).not.toEqual([]);
  });

  test('UTC states the opposite of local intent and is not warned', () => {
    expect(warn('fixed 04:00 UTC time, do not change')).toEqual([]);
  });

  test('a slash pair that is not a zone name is not read as a zone reference', () => {
    expect(warn('sweeps stale issues/PRs')).toEqual([]);
    expect(warn('mirrors Fedora/Rawhide nightly')).toEqual([]);
    expect(warn('posts to example.com/web hooks')).toEqual([]);
  });

  test('a real IANA zone name written in a comment is read as a zone reference', () => {
    expect(warn('deploy window is America/New_York business hours')).not.toEqual([]);
  });
});

describe('finding the prose that annotates a schedule', () => {
  test('a file header comment above name and on still annotates the schedule', () => {
    const finding = only(
      '# Schedule: Every Thursday at 1PM CST (7PM UTC)\n' +
        'name: kickoff-release\n' +
        '\n' +
        'on:\n' +
        '  schedule:\n' +
        '    - cron: "0 19 * * 4"\n',
    );
    expect(finding.warnings.length).toBeGreaterThan(0);
  });

  test('a comment annotating one list item does not warn the next one', () => {
    const findings = scan(
      'on:\n' +
        '  schedule:\n' +
        '    # run at local midnight for the ops team\n' +
        '    - cron: "0 0 * * *"\n' +
        '    - cron: "15 6 * * 1"\n',
    );
    expect(findings[0]?.warnings.length).toBeGreaterThan(0);
    expect(findings[1]?.warnings).toEqual([]);
  });

  test('prose farther back than the lookback budget does not reach the schedule', () => {
    const filler = Array.from({ length: 14 }, (_, i) => `  input${i}:\n`).join('');
    const finding = only(
      '# nightly at local midnight\n' +
        'name: padded\n' +
        'on:\n' +
        `${filler}` +
        '  schedule:\n' +
        '    - cron: "0 0 * * *"\n',
    );
    expect(finding.warnings).toEqual([]);
  });

  test('a comment on the cron line itself annotates that schedule', () => {
    const finding = only('on:\n  schedule:\n    - cron: "0 0 * * *" # local midnight\n');
    expect(finding.expression).toBe('0 0 * * *');
    expect(finding.warnings.length).toBeGreaterThan(0);
  });
});

describe('locating the schedule in source', () => {
  test('the column points at the first character of the cron value', () => {
    const finding = only('on:\n  schedule:\n    - cron: "0 0 * * *"\n');
    expect(finding.line).toBe(3);
    expect(finding.column).toBe(13);
  });

  test('a quartz style hash inside a quoted expression is not stripped as a comment', () => {
    expect(only('on:\n  schedule:\n    - cron: "0 0 12 ? * 6#3"\n').expression).toBe(
      '0 0 12 ? * 6#3',
    );
  });

  test('a cron key with only a comment after it yields no schedule', () => {
    expect(scan('on:\n  schedule:\n    - cron: # filled in later\n')).toEqual([]);
  });
});
