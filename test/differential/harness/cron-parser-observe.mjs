// Observe cron-parser fire sequences across DST transitions.
// Reads scenarios.json (arg 1), prints a fixture JSON to stdout.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scenariosPath = process.argv[2];
const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf8')).scenarios;
const cronParser = require('cron-parser');
const pkg = require('cron-parser/package.json');

function observe(scenario) {
  const start = new Date(scenario.windowStartUtc);
  const end = new Date(scenario.windowEndUtc);
  const fires = [];
  try {
    const parse = cronParser.CronExpressionParser?.parse ?? cronParser.parseExpression;
    const interval = parse(scenario.expression, { currentDate: start, endDate: end, tz: scenario.zone });
    for (;;) {
      let next;
      try {
        next = interval.next();
      } catch {
        break;
      }
      const date = next.toDate ? next.toDate() : next;
      if (date.getTime() > end.getTime()) {
        break;
      }
      fires.push(new Date(date.getTime()).toISOString());
    }
  } catch (error) {
    return { id: scenario.id, error: String((error && error.message) || error) };
  }
  return {
    id: scenario.id,
    expression: scenario.expression,
    zone: scenario.zone,
    direction: scenario.direction,
    windowStartUtc: scenario.windowStartUtc,
    windowEndUtc: scenario.windowEndUtc,
    observedFireInstantsUtc: fires,
  };
}

const fixture = {
  scheduler: 'cron-parser-luxon',
  library: 'cron-parser',
  schedulerVersion: pkg.version,
  runtime: 'node ' + process.version,
  tzdbVersion: process.versions.tz ?? 'unknown',
  capturedVia: 'computed next() sequence over the window',
  scenarios: scenarios.map(observe),
};
process.stdout.write(JSON.stringify(fixture, null, 2) + '\n');
