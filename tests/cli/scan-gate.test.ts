import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { invoke } from './helper';

const dir = mkdtempSync(path.join(tmpdir(), 'cronproof-gate-'));
const baselineFile = path.join(dir, 'baseline.json');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A 02:30 daily job in Europe/Berlin: skipped on spring-forward (high),
// doubled on fall-back (critical). A reliable, tzdb-backed hazard.
writeFileSync(
  path.join(dir, 'app.crontab'),
  'CRON_TZ=Europe/Berlin\n30 2 * * * /usr/bin/backup\n',
  'utf8',
);

interface ScanJson {
  data: { counts: { hazards: number; baselined: number }; hazards: { severity: string }[] };
}

describe('scan as a CI gate over classified hazards', () => {
  test('a repo with a spring-forward/fall-back schedule reports high and critical hazards and fails', () => {
    const { stdout, exit } = invoke(['scan', dir, '--format', 'json', '--fail-on', 'high']);
    const parsed = JSON.parse(stdout) as ScanJson;
    expect(parsed.data.counts.hazards).toBeGreaterThan(0);
    expect(parsed.data.hazards.some((h) => h.severity === 'high' || h.severity === 'critical')).toBe(
      true,
    );
    expect(exit).toBe(1);
  });

  test('SARIF results carry a physical location so annotations land on the source line', () => {
    const { stdout } = invoke(['scan', dir, '--format', 'sarif']);
    const log = JSON.parse(stdout) as {
      runs: { results: { locations: { physicalLocation?: { region: { startLine: number } } }[] }[] }[];
    };
    const result = log.runs[0]?.results[0];
    const physical = result?.locations[0]?.physicalLocation;
    expect(physical?.region.startLine).toBeGreaterThan(0);
  });
});

describe('baseline adoption', () => {
  test('a baseline captured from the repo lets scan pass', () => {
    const written = invoke(['baseline', dir, '--out', baselineFile]);
    expect(written.exit).toBe(0);
    const { exit } = invoke(['scan', dir, '--baseline', baselineFile, '--fail-on', 'high']);
    expect(exit).toBe(0);
  });

  test('a hazard introduced after the baseline still fails while the baselined ones stay quiet', () => {
    writeFileSync(
      path.join(dir, 'new.crontab'),
      'CRON_TZ=America/New_York\n30 2 * * * /usr/bin/newjob\n',
      'utf8',
    );
    const { stdout, exit } = invoke([
      'scan',
      dir,
      '--baseline',
      baselineFile,
      '--format',
      'json',
      '--fail-on',
      'high',
    ]);
    const parsed = JSON.parse(stdout) as ScanJson;
    expect(parsed.data.counts.baselined).toBeGreaterThan(0);
    expect(parsed.data.counts.hazards).toBeGreaterThan(0);
    expect(exit).toBe(1);
    rmSync(path.join(dir, 'new.crontab'));
  });
});

describe('tzdb pin', () => {
  test('a wrong pin fails with the internal exit code before any scanning', () => {
    const { exit, stderr } = invoke(['scan', dir, '--tzdb-check', '1999z']);
    expect(exit).toBe(3);
    expect(stderr).toContain('tzdb drift');
  });
});

// A UTC-less systemd timer: ZONE_UNKNOWN at medium, which sits below the
// default threshold. The summary must not call it gating on a green run.
const belowDir = mkdtempSync(path.join(tmpdir(), 'cronproof-below-'));
afterAll(() => rmSync(belowDir, { recursive: true, force: true }));
writeFileSync(
  path.join(belowDir, 'backup.timer'),
  '[Timer]\nOnCalendar=*-*-* 02:30:00\n',
  'utf8',
);

interface GatingJson {
  data: { counts: { hazards: number; gating: number; failOn: string } };
}

describe('the reported gating count is the one that decides the exit code', () => {
  test('hazards below --fail-on are counted as found but not as gating, and the scan passes', () => {
    const { stdout, exit } = invoke(['scan', belowDir, '--format', 'json', '--fail-on', 'high']);
    const parsed = JSON.parse(stdout) as GatingJson;
    expect(parsed.data.counts.hazards).toBeGreaterThan(0);
    expect(parsed.data.counts.gating).toBe(0);
    expect(parsed.data.counts.failOn).toBe('high');
    expect(exit).toBe(0);
  });

  test('lowering --fail-on to the hazard severity makes the same hazards gating and fails', () => {
    const { stdout, exit } = invoke(['scan', belowDir, '--format', 'json', '--fail-on', 'medium']);
    const parsed = JSON.parse(stdout) as GatingJson;
    expect(parsed.data.counts.gating).toBe(parsed.data.counts.hazards);
    expect(exit).toBe(1);
  });

  test('the human summary labels the gating row with the active threshold', () => {
    const { stdout } = invoke(['scan', belowDir, '--fail-on', 'high']);
    expect(stdout).toContain('hazards (gating, at or above high)');
    expect(stdout).toContain('hazards (found)');
  });
});
