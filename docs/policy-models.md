# Scheduler policy models

cronproof evaluates a schedule under eleven scheduler policy models and
reports where they disagree. This document records, for each model, what it
does at a gap and a fold, where that behavior came from, its verification
status, and the fixture that pins it.

Two statuses exist. **VERIFIED** means phase 6 drove the real scheduler
across a transition and a committed fixture under
[test/differential/fixtures](../test/differential/fixtures) reproduces the
observed fire sequence; the test
[tests/policy/fixture-verification.test.ts](../tests/policy/fixture-verification.test.ts)
replays it. **ASSERTED** means the behavior comes from documentation or, for
the straw model, from definition, and it is never presented as fact. The
statuses, fixtures, and versions below are the ones the CLI prints in its
receipt and that appear in the differential table in
[EVIDENCE.md](../EVIDENCE.md) section 7.

A worked reference point: for `30 2 * * *` in Europe/Berlin across the
fall-back (one ambiguous decision point), EVIDENCE.md section 7 records the
fire counts used throughout this document: naive 2, debian-cron 1, cronie
1, k8s-cronjob 2, quartz UNDEFINED, croniter 2, cronsim 1,
cron-parser-luxon 1, node-cron 1, systemd-timer 1, github-actions
UNDEFINED.

## naive (ASSERTED)

- **Source:** definition. There is no "naive scheduler" to run.
- **Fixture:** none; it is a straw model.
- **Behavior:** pure wall-clock iteration. It fires every labelled slot,
  so a folded time fires twice and a nonexistent interval slot does not
  fire (there is no instant). It exists as the upper bound on double
  firing, not as a real scheduler.

## debian-cron (VERIFIED)

- **Source:** the Debian `cron.8` manual page, which states that on a
  forward shift "those jobs which would have run in the time that was
  skipped will be run soon after the change", that on a backward shift of
  less than 3 hours "those jobs that fall into the repeated time will not
  be re-run", and that only fixed-time jobs are affected because "jobs
  which are specified with wildcards are run based on the new time
  immediately"
  ([cron.8](https://manpages.debian.org/bookworm/cron/cron.8.en.html)).
- **Fixture:** `debian-cron.json`, cron 3.0pl1 driven under libfaketime
  across both transitions in Berlin and New York.
- **Behavior:** a fixed daily job fires once on a fold (the earlier
  instant) and once on a gap (at the transition instant); wildcard and
  interval schedules take the new clock with no compensation.

## cronie (VERIFIED)

- **Source:** cronie is Vixie-derived and shares the documented Vixie DST
  policy above. This repo did not assume it matched Debian; phase 6 ran it.
- **Fixture:** `cronie.json`, cronie 1.7.2 on Fedora under libfaketime.
- **Behavior:** measured identical to debian-cron on every scenario tested
  (see [FINDINGS.md](../FINDINGS.md) finding 4). The two Vixie daemons
  share a decider now, but each rests on its own fixture, not on the
  assumption. The caution may still matter for shifts at or over three
  hours, which were not exercised.

## k8s-cronjob (VERIFIED)

- **Source:** the Kubernetes CronJob docs, which state that with no
  `.spec.timeZone` "the kube-controller-manager interprets schedules
  relative to its local time zone", and describe `startingDeadlineSeconds`
  as a downtime catch-up deadline
  ([CronJob docs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/));
  and the controller's parser, robfig/cron v3, which warns that "jobs
  scheduled during daylight-savings leap-ahead transitions will not be
  run!"
  ([robfig/cron](https://pkg.go.dev/github.com/robfig/cron/v3)).
- **Fixture:** `k8s-cronjob.json`, the robfig/cron v3 `Next()` sequence
  across both transitions.
- **Behavior:** a gap does not fire (the robfig warning), and a fold fires
  twice, because the controller computes schedule times with no fall-back
  suppression. `startingDeadlineSeconds` and the missed-schedule limit
  govern catch-up of runs missed while the controller was down, which is
  orthogonal to a DST gap or fold (a nonexistent local time has no instant
  to have missed), so they are modeled as functions
  (`k8sWouldCatchUp`, `k8sTooManyMissedTimes`), not DST branches.
- **Missed-schedule limit:** the controller uses a fixed threshold of 100.
  In the current v2 controller, more than 100 missed schedules records a
  `TooManyMissedTimes` warning event and then still schedules the most
  recent unmet time. Verified in the controller source at a pinned tag,
  not the prose docs (which truncated on fetch): kubernetes/kubernetes
  v1.31.0 `pkg/controller/cronjob/utils.go` line 172
  (`case numberOfMissedSchedules > 100`) and line 220 (the event emit),
  [utils.go at v1.31.0](https://github.com/kubernetes/kubernetes/blob/v1.31.0/pkg/controller/cronjob/utils.go#L172).
  The threshold is unchanged from the older v1 controller, where the same
  100 was instead a hard error (`FailedNeedsStart`): v1.20.0
  `pkg/controller/cronjob/utils.go` line 147,
  [utils.go at v1.20.0](https://github.com/kubernetes/kubernetes/blob/v1.20.0/pkg/controller/cronjob/utils.go#L147).
  The model implements this as `k8sTooManyMissedTimes`
  (`> DEFAULT_K8S_MISSED_LIMIT`, which is 100); the boundary is asserted in
  tests/policy/k8s-missed-schedule.test.ts.

## quartz (ASSERTED)

- **Source:** the Quartz CronTrigger tutorial, which only warns to "be
  careful when setting fire times" around DST because "the time shift can
  cause a skip or a repeat", without specifying the resulting behavior
  ([CronTrigger](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html)).
- **Fixture:** none. Verifying Quartz needs a JVM and a live scheduler,
  which phase 6 did not set up.
- **Behavior:** its DST gap and fold branches are UNDEFINED, never guessed.
  The CLI prints `?` for quartz at a decision point rather than a fire
  count, and the misfire instructions are parameterized.

## croniter (VERIFIED)

- **Source:** [croniter](https://github.com/kiorky/croniter). It supports
  timezone-aware datetimes but does not document its fold behavior, so the
  behavior was established by observation, not by doc.
- **Fixture:** `croniter.json`, croniter 6.2.4.
- **Behavior:** a folded daily fixed-time job fires **twice**, unlike every
  other cron here, because its monotonic cursor visits both real instants
  of the repeated label ([FINDINGS.md](../FINDINGS.md) finding 1). A
  non-idempotent daily job at a folded wall time runs twice under croniter.

## cronsim (VERIFIED)

- **Source:** [cronsim](https://github.com/cuu508/cronsim), which states it
  emulates Debian's cron and that a differing evaluation "is a bug", and
  that it "handles Daylight Saving Time transitions the same as Debian's
  cron".
- **Fixture:** `cronsim.json`, cronsim 2.7.
- **Behavior:** like debian-cron, a fold fires once and a gap fires at the
  transition. For an interval schedule across a fold the cursor visits both
  instants, so the fold-count depends on cadence
  ([FINDINGS.md](../FINDINGS.md) finding 3).

## cron-parser-luxon (VERIFIED)

- **Source:** [cron-parser](https://github.com/harrisiirak/cron-parser),
  which provides IANA timezone support through Luxon.
- **Fixture:** `cron-parser-luxon.json`, cron-parser 4.9.0.
- **Behavior:** a skipped fixed time is **shifted forward** by the gap to
  the next valid time, an hour later than intended, rather than dropped or
  run at the transition instant. It is the only scheduler here that fires a
  skipped job at a wall time no other scheduler picks
  ([FINDINGS.md](../FINDINGS.md) finding 2). This is Luxon's default
  resolution of a nonexistent local time.

## node-cron (VERIFIED)

- **Source:** [node-cron](https://github.com/node-cron/node-cron), which
  documents a `timezone` option, that "schedules match wall-clock time in
  the task's timezone", and that "across a daylight-saving fall-back the
  repeated hour runs once".
- **Fixture:** `node-cron.json`, node-cron 3.0.3 observed under a virtual
  clock (its real-duration timers cannot be accelerated by a faked wall
  clock, so its own scheduler was driven under an intercepted clock; see
  [FINDINGS.md](../FINDINGS.md) method note).
- **Behavior:** a fold fires once and a gap is dropped.

## systemd-timer (VERIFIED)

- **Source:** the `systemd.time` manual page, which documents that a
  calendar event's timezone may be "the timezone in the IANA timezone
  database format" but does not specify DST edge-case behavior
  ([systemd.time.7](https://manpages.debian.org/testing/systemd/systemd.time.7.en.html)),
  so the behavior was established by observation.
- **Fixture:** `systemd-timer.json`, `systemd-analyze calendar` from
  systemd 249.
- **Behavior:** monotonic next-elapse computation, so a fold fires once and
  a gap is dropped.

## github-actions (ASSERTED)

- **Source:** GitHub's workflow event reference, which states that "For
  schedules that set `timezone` to a time zone that observes daylight
  saving time (DST), during DST spring-forward transitions, scheduled
  workflows in skipped hours advance to the next valid time. For example, a
  2:30 AM schedule advances to 3:00 AM."
  ([events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)).
  The same page documents that scheduled workflows run in UTC unless the
  schedule sets `timezone`.
- **Fixture:** none. Verifying it means waiting on GitHub's hosted
  scheduler through a real transition in a real repository, which no phase
  has done.
- **Behavior:** a skipped fixed daily time fires as a catch-up at the
  transition instant, so 02:30 becomes 03:00 and not 03:30; that
  distinguishes it from cron-parser-luxon, which carries the intended offset
  past the gap. Two branches are UNDEFINED, because the page covers neither:
  a repeated hour, and an interval schedule whose several slots all fall in
  the same gap, where a literal reading would report every one of them firing
  at the identical instant.
