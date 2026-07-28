# FINDINGS.md

Raw material from phase 6, where the ASSERTED scheduler policy models
were checked against real runs. Each entry is backed by a committed
fixture under test/differential/fixtures and reproduced by the test
tests/policy/fixture-verification.test.ts. The 2023 transition dates
are historical and identical across every tzdb release the harnesses
used, so the observations compare directly.

No phase-5 model that made a concrete claim was contradicted: the
three grounded models (debian-cron, k8s-cronjob, node-cron) matched
observed behavior on the first attempt. The models phase 5 left
UNDEFINED (cronie, croniter, cron-parser-luxon, systemd-timer) were
resolved by observation, and cronsim was added. The findings below
are the divergences between real schedulers that the observations
surfaced. They are portability hazards, and two are candidates for
upstream reports.

## Finding 1: croniter fires a daily fixed-time job twice on fall-back

Expression `30 2 * * *`, Europe/Berlin, 2023-10-29 fall-back. croniter
6.2.4 produced two fire instants for the single scheduled 02:30:

    2023-10-29T00:30:00Z  (02:30 CEST)
    2023-10-29T01:30:00Z  (02:30 CET)

Every other cron in this study fires the folded daily time once:
debian-cron, cronie, cronsim, node-cron, and systemd-timer all fire
only the earlier instant. croniter's double fire means a non-idempotent
daily job (a backup, a billing run) scheduled at a wall time inside a
fall-back hour runs twice under croniter. This is the DOUBLED hazard of
phase 4 made real, and it is croniter-specific. Fixture:
test/differential/fixtures/croniter.json.

## Finding 2: cron-parser shifts a skipped fixed-time firing forward

Expression `30 2 * * *`, Europe/Berlin, 2023-03-26 spring-forward.
cron-parser 4.9.0 (Luxon-backed) fired at:

    2023-03-26T01:30:00Z  (03:30 CEST)

The scheduled 02:30 does not exist; cron-parser moved it forward by the
one-hour gap to 03:30, an hour later than intended, rather than
dropping it (systemd, node-cron) or running it at the transition
instant of 03:00 (debian-cron, cronie, croniter, cronsim). A job
expected at 02:30 runs at 03:30 under cron-parser. This is Luxon's
default resolution of a nonexistent local time, and it makes
cron-parser the only scheduler here that fires a skipped job at a wall
time no other scheduler would pick. Fixture:
test/differential/fixtures/cron-parser-luxon.json.

## Finding 3: the fold-count of the cursor libraries depends on cadence

For an interval schedule (`*/15 * * * *`) across a fall-back, the
cursor-based libraries cron-parser, croniter, and cronsim all fire the
repeated hour's slots twice (both instants), because their monotonic
next-time cursor visits every real instant. For a once-daily fixed job
across the same fall-back, they diverge: croniter still fires twice,
while cron-parser and cronsim fire once, because a daily cursor lands
on the folded label once and its next step is the next day. So the
same library can fire a folded time once or twice depending only on
whether the schedule is an interval or a fixed daily time. The models
encode this with the fixed-vs-interval split (src/policy/models/profile.ts).

## Finding 4: cronie behaves identically to debian-cron here

Phase 5 refused to assume cronie matched Debian. Phase 6 ran cronie
1.7.2 on Fedora across both transitions in both zones and observed
behavior identical to debian-cron on every scenario: fixed-time jobs
fire once at the earlier instant on fall-back and once at the
transition instant on spring-forward, and wildcard jobs get no
compensation. The two Vixie-derived daemons share a decider now, but
each rests on its own fixture (cronie.json, debian-cron.json), not on
the assumption. This is a confirmation, not a contradiction, and it is
worth stating because the caution turned out to be unnecessary for
these cases (it may still hold for shifts at or over three hours or in
zones with unusual rules, which were not exercised here).

## Finding 5: two behaviors were observed but not independently verified

- quartz: not run. Verifying it needs a JVM and a live Quartz
  scheduler, which this phase did not set up. Its model stays ASSERTED
  with the misfire instructions parameterized and its DST gap and fold
  branches UNDEFINED, never guessed.
- naive: a definitional straw model. There is no "naive scheduler" to
  run, so it stays ASSERTED by definition, not by observation.

## Method note

Real cron daemons were driven across a transition with libfaketime and
a no-sleep LD_PRELOAD shim: the shim collapses the daemon's per-minute
sleep to near-instant, and a controller steps a real-relative UTC
offset (unambiguous across the fold, unlike a local wall string) so the
daemon races through every minute in seconds while still seeing the
clock jumps its DST logic keys off. node-cron arms real-duration timers
that a faked wall clock cannot accelerate, so it was observed by
running its own scheduler under an intercepted Date and timer set (a
virtual clock), which is a faithful observation of its scheduling
decisions. See test/differential/harness.
