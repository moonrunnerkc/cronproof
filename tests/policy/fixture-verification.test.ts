import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';
import { enumerate, parse } from '../../src/cron/index';
import type { LocalFiring } from '../../src/cron/index';
import { outcomeInstants, policyModel } from '../../src/policy/index';
import type { PolicyId } from '../../src/policy/index';
import { createTzifBackend, resolveWallClock, vendoredZoneinfoRoot, type TzifBackend } from '../../src/tz/index';

const root = vendoredZoneinfoRoot();
if (root === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}
const ROOT: string = root;

const FIXTURE_DIR = path.join(fileURLToPath(import.meta.url), '..', '..', '..', 'test', 'differential', 'fixtures');
const DAY = 86_400_000;
const MINUTE = 60_000;

interface Scenario {
  id: string;
  expression: string;
  zone: string;
  windowStartUtc: string;
  windowEndUtc: string;
  observedFireInstantsUtc?: string[];
  error?: string;
}
interface Fixture {
  scheduler: PolicyId;
  schedulerVersion: string;
  scenarios: Scenario[];
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf8')) as Fixture)
    .filter((fixture) => fixture.scenarios.some((s) => Array.isArray(s.observedFireInstantsUtc)));
}

function fieldsOf(utcMillis: number): LocalFiring {
  const d = new Date(utcMillis);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

let backend: TzifBackend;
beforeAll(() => {
  backend = createTzifBackend({ zoneinfoRoot: ROOT });
});

/** Instants the model predicts for a scenario that fall in the window interior. */
function modelInterior(scheduler: PolicyId, scenario: Scenario): number[] {
  const parsed = parse(scenario.expression, 'vixie');
  if (!parsed.ok) {
    throw new Error(`parse failed for ${scenario.expression}`);
  }
  const startUtc = Date.parse(scenario.windowStartUtc);
  const endUtc = Date.parse(scenario.windowEndUtc);
  const firings = enumerate(parsed.ast, {
    zone: scenario.zone,
    from: fieldsOf(startUtc - DAY),
    to: fieldsOf(endUtc + DAY),
  });
  const model = policyModel(scheduler);
  const instants = new Set<number>();
  for (const local of firings) {
    const resolution = resolveWallClock(local, scenario.zone, backend);
    for (const instant of outcomeInstants(model.decide({ local, resolution }, parsed.ast, {}))) {
      if (instant > startUtc + MINUTE && instant < endUtc - MINUTE) {
        instants.add(instant);
      }
    }
  }
  return [...instants].sort((a, b) => a - b);
}

function observedInterior(scenario: Scenario): number[] {
  const startUtc = Date.parse(scenario.windowStartUtc);
  const endUtc = Date.parse(scenario.windowEndUtc);
  return (scenario.observedFireInstantsUtc ?? [])
    .map((iso) => Date.parse(iso))
    .filter((instant) => instant > startUtc + MINUTE && instant < endUtc - MINUTE)
    .sort((a, b) => a - b);
}

describe('every model reproduces its real observed fixture', () => {
  const fixtures = loadFixtures();

  test('fixtures exist for the required schedulers, both directions, both zones', () => {
    const present = new Set(fixtures.map((f) => f.scheduler));
    for (const required of ['debian-cron', 'cronie', 'croniter', 'cronsim', 'cron-parser-luxon', 'node-cron'] as const) {
      expect(present.has(required), `missing fixture for ${required}`).toBe(true);
    }
    for (const fixture of fixtures) {
      const directions = new Set(
        fixture.scenarios.filter((s) => s.observedFireInstantsUtc).map((s) => `${s.zone}:${s.id.split('-')[1]}`),
      );
      expect(directions.has('Europe/Berlin:fall'), `${fixture.scheduler} Berlin fall`).toBe(true);
      expect(directions.has('Europe/Berlin:spring'), `${fixture.scheduler} Berlin spring`).toBe(true);
      expect(directions.has('America/New_York:fall'), `${fixture.scheduler} NY fall`).toBe(true);
      expect(directions.has('America/New_York:spring'), `${fixture.scheduler} NY spring`).toBe(true);
    }
  });

  for (const fixture of loadFixtures()) {
    for (const scenario of fixture.scenarios) {
      if (!Array.isArray(scenario.observedFireInstantsUtc)) {
        continue;
      }
      test(`${fixture.scheduler} matches observed firings for ${scenario.id}`, () => {
        expect(modelInterior(fixture.scheduler, scenario)).toEqual(observedInterior(scenario));
      });
    }
  }
});
