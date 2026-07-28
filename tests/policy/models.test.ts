import { describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import type { CronAst, LocalFiring } from '../../src/cron/index';
import { policyModel } from '../../src/policy/index';
import type { PolicyId, ResolvedFiring } from '../../src/policy/index';
import type { WallClockResolution } from '../../src/tz/index';

function ast(expression: string): CronAst {
  const parsed = parse(expression, 'vixie');
  if (!parsed.ok) {
    throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  return parsed.ast;
}

const LOCAL: LocalFiring = { year: 2023, month: 10, day: 29, hour: 2, minute: 30, second: 0 };

function firing(resolution: WallClockResolution): ResolvedFiring {
  return { local: LOCAL, resolution };
}

const UNIQUE: WallClockResolution = { kind: 'unique', instant: 111, offsetSeconds: 0 };
const foldOf = (millis: number): WallClockResolution => ({
  kind: 'ambiguous',
  candidateInstants: [1000, 1000 + millis],
  earlierInstant: 1000,
  laterInstant: 1000 + millis,
  foldDurationMilliseconds: millis,
});
const gapOf = (millis: number): WallClockResolution => ({
  kind: 'nonexistent',
  transitionInstant: 5000,
  gapStartWallMillis: 0,
  gapEndWallMillis: millis,
  gapDurationMilliseconds: millis,
});

const HOUR = 3_600_000;
const fixed = ast('30 2 * * *');
const wildcard = ast('*/10 * * * *');

function decide(id: PolicyId, resolution: WallClockResolution, schedule: CronAst = fixed): ReturnType<ReturnType<typeof policyModel>['decide']> {
  return policyModel(id).decide(firing(resolution), schedule, {});
}

describe('every policy fires a unique time once at its instant', () => {
  const ids: PolicyId[] = [
    'naive',
    'debian-cron',
    'cronie',
    'k8s-cronjob',
    'quartz',
    'croniter',
    'cronsim',
    'cron-parser-luxon',
    'node-cron',
    'systemd-timer',
  ];
  test.each(ids)('%s fires a unique time once', (id) => {
    expect(decide(id, UNIQUE)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 111 });
  });
});

describe('debian-cron follows the cron(8) rule', () => {
  test('fixed-time fall-back under three hours fires once, at the first occurrence', () => {
    expect(decide('debian-cron', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
  });

  test('fixed-time spring-forward under three hours fires as a catch-up after the jump', () => {
    expect(decide('debian-cron', gapOf(HOUR), fixed)).toEqual({ kind: 'FIRES_AT_CATCHUP', instant: 5000 });
  });

  test('wildcard fall-back gets no compensation and fires twice', () => {
    expect(decide('debian-cron', foldOf(HOUR), wildcard)).toEqual({
      kind: 'FIRES_TWICE_AT',
      first: 1000,
      second: 1000 + HOUR,
    });
  });

  test('wildcard spring-forward gets no compensation and does not fire', () => {
    expect(decide('debian-cron', gapOf(HOUR), wildcard)).toEqual({ kind: 'DOES_NOT_FIRE' });
  });

  test('a shift of three hours or more disables special handling even for fixed-time jobs', () => {
    expect(decide('debian-cron', foldOf(3 * HOUR), fixed)).toEqual({
      kind: 'FIRES_TWICE_AT',
      first: 1000,
      second: 1000 + 3 * HOUR,
    });
  });
});

describe('naive fires on every wall-clock occurrence', () => {
  test('fall-back fires twice', () => {
    expect(decide('naive', foldOf(HOUR))).toEqual({ kind: 'FIRES_TWICE_AT', first: 1000, second: 1000 + HOUR });
  });
  test('spring-forward does not fire', () => {
    expect(decide('naive', gapOf(HOUR))).toEqual({ kind: 'DOES_NOT_FIRE' });
  });
});

describe('k8s-cronjob has no fold suppression and skips gaps', () => {
  test('fall-back fires twice', () => {
    expect(decide('k8s-cronjob', foldOf(HOUR))).toEqual({ kind: 'FIRES_TWICE_AT', first: 1000, second: 1000 + HOUR });
  });
  test('spring-forward does not fire', () => {
    expect(decide('k8s-cronjob', gapOf(HOUR))).toEqual({ kind: 'DOES_NOT_FIRE' });
  });
});

describe('node-cron fires the folded hour once', () => {
  test('fall-back fires once at the first occurrence', () => {
    expect(decide('node-cron', foldOf(HOUR))).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
  });
  test('spring-forward does not fire', () => {
    expect(decide('node-cron', gapOf(HOUR))).toEqual({ kind: 'DOES_NOT_FIRE' });
  });
});

describe('cronie was verified to behave identically to debian-cron', () => {
  test('fixed-time fall-back fires once and spring-forward is a catch-up', () => {
    expect(decide('cronie', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
    expect(decide('cronie', gapOf(HOUR), fixed)).toEqual({ kind: 'FIRES_AT_CATCHUP', instant: 5000 });
  });
});

describe('the libraries verified in phase 6', () => {
  test('croniter fires the folded daily time twice and a skipped one at the transition', () => {
    expect(decide('croniter', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_TWICE_AT', first: 1000, second: 1000 + HOUR });
    expect(decide('croniter', gapOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 5000 });
  });

  test('cronsim fires the folded daily time once and a skipped one at the transition', () => {
    expect(decide('cronsim', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
    expect(decide('cronsim', gapOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 5000 });
  });

  test('systemd-timer fires the folded time once and drops a skipped one', () => {
    expect(decide('systemd-timer', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
    expect(decide('systemd-timer', gapOf(HOUR), fixed)).toEqual({ kind: 'DOES_NOT_FIRE' });
  });

  test('the cursor libraries fire a folded interval slot twice but a folded daily job varies', () => {
    expect(decide('cron-parser-luxon', foldOf(HOUR), fixed)).toEqual({ kind: 'FIRES_ONCE_AT', instant: 1000 });
    expect(decide('cron-parser-luxon', foldOf(HOUR), wildcard)).toEqual({ kind: 'FIRES_TWICE_AT', first: 1000, second: 1000 + HOUR });
    expect(decide('croniter', foldOf(HOUR), wildcard)).toEqual({ kind: 'FIRES_TWICE_AT', first: 1000, second: 1000 + HOUR });
  });
});

describe('quartz remains UNDEFINED at the hazard, never guessed', () => {
  test('quartz is UNDEFINED on both fold and gap (not run in phase 6)', () => {
    expect(decide('quartz', foldOf(HOUR))).toEqual({ kind: 'UNDEFINED' });
    expect(decide('quartz', gapOf(HOUR))).toEqual({ kind: 'UNDEFINED' });
  });
});
