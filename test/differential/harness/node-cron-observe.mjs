// Observe node-cron's fire sequence across DST transitions. node-cron
// schedules with real-duration timers, so a faked wall clock cannot
// accelerate it. Instead we run node-cron's own scheduling code under a
// virtual clock: Date and the timer functions are intercepted before
// node-cron loads, and a discrete-event loop advances virtual time to
// each timer node-cron arms and fires it. The firing decisions are
// node-cron's; only the clock substrate is virtual (the same technique
// as fake timers in test frameworks). Reads scenarios.json (arg 1).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scenarios = JSON.parse(readFileSync(process.argv[2], 'utf8')).scenarios;
const pkg = require('node-cron/package.json');

const RealDate = Date;

function observe(scenario) {
  const startMs = new RealDate(scenario.windowStartUtc).getTime();
  const endMs = new RealDate(scenario.windowEndUtc).getTime();
  let virtualNow = startMs;
  let seq = 1;
  const timers = new Map();

  // Intercept the clock and timers for node-cron's scheduler.
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [virtualNow]));
    }
    static now() {
      return virtualNow;
    }
  };
  const schedule = (cb, delay) => {
    const id = seq++;
    timers.set(id, { fireAt: virtualNow + Math.max(0, delay || 0), cb });
    return id;
  };
  globalThis.setTimeout = schedule;
  globalThis.setInterval = (cb, delay) => {
    const wrapped = () => {
      cb();
      timers.set(id, { fireAt: virtualNow + Math.max(1, delay || 1), cb: wrapped });
    };
    const id = schedule(wrapped, delay);
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.clearInterval = (id) => timers.delete(id);

  const fires = [];
  delete require.cache[require.resolve('node-cron')];
  const cron = require('node-cron');
  const task = cron.schedule(
    scenario.expression,
    () => {
      fires.push(new globalThis.Date().toISOString());
    },
    { timezone: scenario.zone, scheduled: true },
  );

  let guard = 0;
  while (timers.size > 0 && guard++ < 200000) {
    let nextId = null;
    let nextAt = Infinity;
    for (const [id, timer] of timers) {
      if (timer.fireAt < nextAt) {
        nextAt = timer.fireAt;
        nextId = id;
      }
    }
    if (nextId === null || nextAt > endMs) {
      break;
    }
    virtualNow = nextAt;
    const timer = timers.get(nextId);
    timers.delete(nextId);
    timer.cb();
  }
  if (task && typeof task.stop === 'function') {
    task.stop();
  }

  globalThis.Date = RealDate;
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

const results = scenarios.map(observe);
globalThis.Date = RealDate;
const fixture = {
  scheduler: 'node-cron',
  library: 'node-cron',
  schedulerVersion: pkg.version,
  runtime: 'node (virtual-clock discrete-event driver over node-cron)',
  tzdbVersion: process.versions.tz ?? 'unknown',
  capturedVia: "node-cron's own scheduler run under intercepted Date and timers",
  scenarios: results,
};
process.stdout.write(JSON.stringify(fixture, null, 2) + '\n');
