# DECISIONS.md

Running log of decisions made without asking clarifying questions, per
this repo's standing rules. Each entry records the choice and the
reasoning at the time it was made.

## 2026-07-25: Why cronproof is a differential prover

Existing cron libraries each answer "when does this schedule fire?"
by committing to a single policy for timezone offset transitions:

- cronsim (Python) documents that it "handles Daylight Saving Time
  transitions the same as Debian's cron": on spring forward, jobs
  that fell into the skipped interval run immediately after it; on
  fall back, duplicate executions are suppressed. One policy,
  Debian's. Source, fetched 2026-07-25:
  https://github.com/cuu508/cronsim
- cron-parser (npm) advertises timezone support via Luxon and states
  it will "correctly handle DST transition", but does not document
  which convention it applies to skipped or ambiguous local times.
  The policy is implicit in the implementation. Source, fetched
  2026-07-25: https://github.com/harrisiirak/cron-parser
- Cronos (.NET) documents Vixie-cron-compatible behavior: on spring
  forward it shifts an invalid occurrence to the next valid time; on
  fall back it distinguishes interval expressions (fire before and
  after the shift) from non-interval expressions (fire only before
  the shift). One policy, Vixie cron's. Source, fetched 2026-07-25:
  https://github.com/HangfireIO/Cronos

These are all single-policy oracles. They are internally consistent
and mutually inconsistent: the same expression, timezone, and range
can legitimately produce different firing sequences depending on
which library (and therefore which scheduler policy) evaluates it.
A user asking "is my 02:30 nightly job safe in Europe/Berlin?" gets
one answer per library and no signal that the answer is contested.

cronproof therefore does not implement "the" answer. It evaluates the
same schedule under multiple explicit scheduler policy models and
reports where they disagree. A disagreement is the finding: it marks
a firing that is skipped, doubled, or ambiguous under at least one
deployed policy, which is exactly the hazard an operator needs to
know about before picking a scheduler or a wall-clock time. Where all
models agree, cronproof reports the firing as safe under the modeled
policies. It never collapses a disagreement into a single "correct"
firing time, because for these libraries correctness is
policy-relative.

## 2026-07-25: Toolchain pinned to Node 22.16.0 via .nvmrc

The spec requires Node 22+. The machine default was v20.19.5, with
v22.16.0 available. All commands in this repo, including the evidence
harness, run under 22.16.0, and CI installs the version from .nvmrc
so that regenerated EVIDENCE.md output is comparable (same Node, same
bundled ICU, same tzdb).

## 2026-07-25: "Dual output" means ESM plus CJS for the library entry

The spec says "ESM only" and also "tsup for dual output with
declarations". Read together: the package source and module type are
ESM only ("type": "module"), and tsup builds the library entry in
both ESM and CJS formats with declarations so CJS consumers can
require it. The CLI entry is built ESM only, since its bin runs under
Node 22 where ESM and top-level await are native.

## 2026-07-25: Lint rules enforced, and the config-file exemption

Enforced as ESLint errors on every TS and JS file:

- no default exports: custom rule cronproof/no-default-export in
  tools/eslint/, covering both declaration and aliased specifier forms
- kebab-case filenames: custom rule cronproof/kebab-case-filename
- 300-line hard cap: core max-lines with skipBlankLines and
  skipComments false, so it is a real file-length cap
- no `any`: @typescript-eslint/no-explicit-any
- no em dashes anywhere including comments: custom rule
  cronproof/no-em-dash, scanning raw source text

Exemption: eslint.config.js and *.config.ts / *.config.js files may
use default exports, because ESLint, Vitest, and tsup consume their
config files through a default export; there is no named-export
alternative in those tools' config loading. The exemption is scoped
to exactly those filenames.

JSDoc-on-every-export is a CLAUDE.md standard not yet backed by a
lint rule in this phase; the phase 1 spec lists four rules to enforce
mechanically and JSDoc is not among them. It is applied by hand in
phase 1 and should get a lint rule in a later phase.

## 2026-07-25: EVIDENCE.md determinism and the git SHA fixed point

EVIDENCE.md captures stdout, stderr, and exit codes verbatim. CI
regenerates it on the same SHA and fails on drift. Two honest runs of
identical commands on identical trees still differ in generation
timestamp, wall-clock durations, clock times, absolute repo path,
and the git SHA line. The comparison (scripts/evidence.ts --check)
therefore normalizes exactly those fields on both sides before
diffing; all command output and every exit code must match exactly.

One further normalization proved necessary in practice: tsup builds
its output formats concurrently and interleaves its log lines in
nondeterministic order between otherwise identical runs. Lines inside
each captured output block are therefore compared as a sorted
multiset. Every line must still be present with the same content and
multiplicity; only intra-block ordering is forgiven.

The git SHA line needs one more note: a file committed together with
the code cannot contain the SHA of the commit that includes it (the
SHA depends on the file's content). EVIDENCE.md records the SHA of
HEAD at generation time plus a dirty flag, and the SHA line is
excluded from the drift comparison.

## 2026-07-25: Phase 2, cross-check compares both backends on the same tzdb release

Measured on this machine: the Intl backend reads the tzdb bundled
with Node 22.16.0's ICU, which reports process.versions.tz = 2025b,
while /usr/share/zoneinfo carries 2026b (tzdata.zi header
"# version 2026b"). Running the cross-check across those two roots
produced 859 disagreements in 14 zones, for example
America/Vancouver (first unmatched transition 2026-11-01T09:00:00Z,
present only in the 2025b side) and America/Boa_Vista (transitions
at 2000-10-08 and 2000-10-15 present only in the 2026b side). Those
are differences between tzdb releases, not between the two
implementations, so a cross-check spanning releases cannot separate
code defects from data drift.

Decision: the repo vendors zoneinfo compiled from the IANA source
release matching the pinned runtime's ICU tzdb, and the evidence
cross-check runs against that root. Vendored copy: tzdata2025b
compiled with the system zic into vendor/zoneinfo (599 files), with
the release's version file copied to +VERSION. Source, fetched
2026-07-25:
https://data.iana.org/time-zones/releases/tzdata2025b.tar.gz
(sha512 7d83741f3cae81fac8131994b43c55b6da7328df18b706e5ee40e9b3212b
c506e6f8fc90988b18da424ed59eff69bce593f2783b7b5f18eb483a17aeb94258d6).
The version mismatch between system zoneinfo and ICU remains real
and tzdbVersionWarning reports it loudly whenever the two sources
disagree; the vendored root also serves as the documented fallback
for systems without /usr/share/zoneinfo.

## 2026-07-25: Phase 2, two-direction cross-check instead of naive list zip

The Intl backend has no transition table; its transitionsBetween
scans offsets with a 7-day probe and bisects each change. A pair of
opposing transitions with zero net offset change inside one probe
interval is invisible to that scan. This is not hypothetical:
tzdb 2025b records DST in several Brazilian zones from 2000-10-08
to 2000-10-15, six days and 23 hours apart with zero net change,
and the scan misses the pair even though ICU's own data contains it
(verified by direct offset queries at 2000-10-10 in
America/Boa_Vista, America/Recife, and America/Noronha).

Decision: the cross-check verifies in two directions. Every TZif
transition is checked against the Intl backend's offsets one second
before the instant and at the instant, which queries ICU data
directly and does not depend on scan granularity. Every transition
the Intl scan does find must exist in the TZif list with identical
offsets. Every transition known to either backend is therefore
compared; the only undetectable case is a transition pair absent
from the TZif table that the Intl scan also misses, which the TZif
side's completeness (a parsed table, not a scan) makes moot for
zones the tzdb records.

## 2026-07-25: Phase 2, legacy alias names that Intl remaps to other zones

Measured via resolvedOptions().timeZone on this runtime: Intl
canonicalizes legacy names to city zones (EET to Europe/Athens, WET
to Europe/Lisbon, CET and MET to Europe/Brussels, EST5EDT to
America/New_York). When the substituted zone's TZif data is
identical to the named file's data over the check range, the
comparison is still meaningful and the zone is checked (in tzdb
2025b, EET is a link to Europe/Athens and their transition lists
match exactly). When the substituted data differs in range, Intl is
answering about a different zone and the zone is skipped with a
printed reason rather than reported as a backend disagreement. In
the 2025b evidence run the only skip is Factory, which Intl rejects
outright.

## 2026-07-25: Phase 2, isDst is reported raw and never consumed

The TZif backend reports the isdst byte exactly as stored. The Intl
backend has no DST bit; it marks an instant DST when the CLDR long
name contains "Daylight" or "Summer", documented as a heuristic.
The two encodings legitimately disagree: the vendored 2025b build
of Europe/Dublin models winter GMT as the DST variant
(offset 0, isDst true) and summer IST as standard time
(offset 3600, isDst false), while Ubuntu's system build of the same
zone uses the rearguard encoding with the flag reversed. Both are
measured in this repo's tests and smoke runs. Consequence: no code
in this repo uses isDst for offset math, season detection, or
wall-clock resolution; resolveWallClock consumes offsets and
transitions only, and the cross-check compares instants and offsets
only. The acceptance tests pass identically against both encodings.

## 2026-07-25: Phase 2, resolveWallClock result shapes

Gap bounds for NONEXISTENT are reported as wall milliseconds (the
skipped local readings encoded as if they were UTC) plus the UTC
transition instant, because the skipped interval exists only on the
wall clock; its UTC extent is a single instant. AMBIGUOUS carries
both instants as earlierInstant and laterInstant plus a
candidateInstants array; the array is future-proofing for the
theoretical case of more than two candidates, and the fold duration
is the wall overlap between the earliest and latest candidates.
Local fields before the first recorded transition or after 2262
were not special-cased; the backends answer whatever their data
supports.

## 2026-07-25: Phase 2, pre-first-transition type follows RFC 8536

An earlier draft of the TZif parser used the old tzfile reader
heuristic (first non-DST type) for timestamps before the first
transition. RFC 8536 section 3.2 specifies time type 0. Fetched
2026-07-25: https://www.rfc-editor.org/rfc/rfc8536. The parser now
uses type 0, and the full cross-check passes against ICU with that
rule.

## 2026-07-27: Phase 3, enumeration duplicates civil calendar math

The enumerator must be provably free of any timezone dependency: an
acceptance test runs it with the tz module mocked to throw on any
call, and a second test asserts identical output across different
zone arguments. Importing the civil-date helpers from src/tz would
put tz code in the enumerator's module graph and undermine that
proof. src/cron/calendar.ts therefore reimplements the small
civil-date core (leap year, days in month, days-from-civil,
civil-from-days, weekday, and the last/nearest-weekday helpers the
special tokens need). This is a deliberate exception to DRY-at-3: the
two copies exist for an architectural reason (separation of
enumeration from resolution), not by accident, and each is covered by
its own tests.

## 2026-07-27: Phase 3, GitHub Actions timezone, documentation discrepancy

The phase brief says github-actions is "UTC only, timezone rejected."
The current GitHub docs, fetched this session
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
state: "By default, scheduled workflows run in UTC. You can optionally
specify a timezone using an IANA timezone string," with the timezone
given as a sibling YAML key next to the cron string, not as a token
inside the cron expression. The cron expression itself remains the
five-field POSIX subset with operators * , - / and no nonstandard
tokens. cronproof parses the cron STRING; the workflow-level
timezone: key is outside that grammar. The github-actions dialect is
therefore implemented as five-field, UTC-defaulted (utcOnly true on
the spec), rejecting L, W, #, ? and @-macros, matching the documented
cron-string grammar. The optional workflow timezone is out of scope
for a cron-string parser and is recorded here rather than silently
contradicting the brief.

## 2026-07-27: Phase 3, the MON#5 example needs a #-supporting dialect

The brief lists `0 0 * 2 MON#5` among the differential cases. The "#"
nth-weekday token is supported only by Quartz and AWS EventBridge
(Quartz docs: "6#3" means the third Friday;
https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html;
AWS docs: "3#2 would be the second Tuesday";
https://docs.aws.amazon.com/scheduler/latest/UserGuide/schedule-types.html).
Both dialects require six or more fields, so the five-field form
`0 0 * 2 MON#5` is valid in no dialect (and the parser rejects "#" in
Vixie with a located error, which the rejection table asserts). The
differential table covers the nth-weekday construct with the valid
Quartz expression `0 0 0 ? * MON#5` and hand-verified fifth-Monday
dates, and separately asserts that Vixie rejects the "#" token. This
tests the construct the brief intends without asserting an
expression no real dialect accepts.

## 2026-07-27: Phase 3, day-of-month / day-of-week combination per dialect

Vixie, Debian, k8s (robfig/cron), and GitHub Actions apply the POSIX
OR quirk: when both day fields are restricted (neither is "*"), a day
fires if EITHER matches. Sources fetched this session: crontab(5)
("If both fields are restricted ... the command will be run when
either field matches", https://man7.org/linux/man-pages/man5/crontab.5.html)
and robfig/cron v3 docs (https://pkg.go.dev/github.com/robfig/cron/v3).
Quartz and AWS EventBridge instead forbid restricting both at once
and require "?" in one of the two day fields (Quartz: "you must
currently use the '?' character in one of these fields"; AWS: "You
can't use * in both Day-of-month and Day-of-week"). Those two
dialects therefore set orQuirk false and requireQuestionMark true;
because one day field is always unrestricted, the plain AND
combination is correct for them. systemd combines weekday and date
with AND (no quirk).

## 2026-07-27: Phase 3, day-of-week numbering canonicalized to 0..6

Internally day-of-week is always 0 (Sunday) through 6 (Saturday).
Vixie and robfig accept 0 to 7 with both 0 and 7 as Sunday
(crontab(5), robfig docs). Quartz and AWS number 1 to 7 with 1 as
Sunday (Quartz/AWS docs above); those map value minus one. Names
(SUN..SAT, full names) resolve directly to canonical numbers in every
dialect. Ranges are expanded in the dialect's own number space first,
then each value is canonicalized, so Vixie "0-7" yields the full week
and Quartz "1-7" yields the full week without a spurious wrap.

## 2026-07-27: Phase 3, year-field domains

Quartz year domain is 1970 to 2099 and AWS EventBridge is 1970 to
2199, taken from each product's documentation of the optional/required
year field (Quartz CronTrigger; AWS EventBridge Scheduler cron table,
which lists Year 1970-2199). Other dialects carry no year field.

## 2026-07-27: Phase 3, systemd OnCalendar supported subset

OnCalendar is a separate grammar (systemd.time(7),
https://man7.org/linux/man-pages/man7/systemd.time.7.html), so it has
its own parser producing the shared AST. The supported subset:
weekday names with ".." ranges and "," lists; a date of
Year-Month-Day or Month-Day with "*", integers, ".." ranges, ","
lists, "/" steps, and the "~" from-end day operator; a time of
Hour:Minute[:Second] with the same operators; and the shorthand
keywords minutely, hourly, daily, weekly, monthly, yearly, annually,
quarterly. Constructs outside this subset (timezone suffixes,
sub-second precision, unclassifiable tokens) are rejected with a
located reason rather than parsed loosely. This is enough to map
OnCalendar onto the same firing semantics as the field dialects
where they overlap, which is what the phase requires.

## 2026-07-27: Phase 3, enumeration window is wall-clock, zone is carried not used

The enumerator takes the schedule, a zone, and a window, and returns
intended wall-clock firing tuples "before any timezone resolution."
Converting a UTC instant to a wall-clock field tuple requires an
offset, which is timezone work, so enumeration cannot consume a true
UTC range without touching tz. The window is therefore expressed as
naive wall-clock field bounds (from/to), and the zone is carried
through as metadata for the later resolver but never read during
enumeration. Two tests lock this in: output is identical across
zone arguments, and enumeration succeeds with the tz module mocked to
throw. Debian's distinction from Vixie is likewise behavioral, not
syntactic: the two share the same parse surface here, and the DST
branch that keys off the literal leading asterisk (preserved as
startsWithAsterisk on the minute and hour fields) lands in phase 5.

## 2026-07-27: Phase 4, severity model

Severity ranks, most to least severe: critical, high, medium, low,
info. Assignment:

- DOUBLED: critical when the work is not idempotent, low when it is.
  A duplicate run of non-idempotent work corrupts state (double
  charge, double email, double ledger entry); a duplicate of
  idempotent work is harmless. This is the brief's requirement that
  DOUBLED outrank SKIPPED on non-idempotent work.
- SKIPPED: high. A missed run delays or drops one execution but never
  corrupts state, and it is usually recoverable by a catch-up run.
  High, but below a non-idempotent double.
- COUNT_ANOMALY: high. A calendar day that does not exist means a
  daily job silently never runs that day; the silence is the danger.
- INTERVAL_DRIFT: medium. Cadence stretches or compresses across the
  transition, but no distinct run is lost or duplicated.
- ZONE_UNSTABLE: info. Not a fault, a label: the region is a
  prediction from POSIX footer extrapolation, not a recorded fact.

Idempotence cannot be inferred from a cron line (nothing in
`0 0 * * *` says whether the job is a backup or a payment), so it is
an explicit per-schedule input flag, `idempotent`, defaulting to
false. The default therefore treats every double as critical until a
human asserts the work is safe to repeat. The flag changes only
severity, never the hazard id, so baselines survive a change of the
flag.

## 2026-07-27: Phase 4, acceptance discrepancy, the November DOUBLED case

The brief states: "`30 2 * * *` America/New_York over 2024: exactly
one SKIPPED on March 10, one DOUBLED on November 3." The SKIPPED half
is correct: 02:30 falls in the spring-forward gap. The DOUBLED half
is not: America/New_York falls back at 02:00 to 01:00, so the hour
that occurs twice is 01:00 to 01:59, and 02:30 occurs exactly once.

Verified this session with the repo's own resolver against the
vendored tzdata 2025b:
- resolveWallClock(2024-11-03 02:30, America/New_York) = unique,
  instant 2024-11-03T07:00:00Z.
- resolveWallClock(2024-11-03 01:30, America/New_York) = ambiguous,
  instants 2024-11-03T05:30:00Z and 2024-11-03T06:30:00Z.

So `30 2 * * *` cannot produce a DOUBLED in New York; the expression
that doubles at the fold is `30 1 * * *`. Per standing rule 1, the
classifier is implemented to the tz facts, not to the brief's
expected output, and the discrepancy is recorded here rather than
worked around. The acceptance test asserts: `30 2` yields the SKIPPED
on March 10 and is not doubled in November, and `30 1` yields the
DOUBLED on November 3 with both instants. The hazard-table script
prints both expressions and notes the correction.

## 2026-07-27: Phase 4, interval-like detection and INTERVAL_DRIFT model

A schedule is interval-like when its minute field literally begins
with "*" and matches more than one value (a wildcard or a step such
as */15). This reuses the startsWithAsterisk flag that phase 3
preserves. For interval-like schedules the individual sub-hour slots
are not distinct jobs, so a slot landing in a gap or a fold is not
reported as SKIPPED or DOUBLED; instead each offset transition the
schedule fires around produces one INTERVAL_DRIFT.

The recorded intervals: expected is the nominal cadence (the modal
spacing between consecutive firings away from a transition, 15 min
for */15); actual is cadence plus the transition magnitude. For a
one-hour transition and a 15-minute cadence the affected interval is
75 minutes. On spring-forward this is the wall-clock gap with no
firing (01:45 then 03:00); on fall-back it is the real-time gap
between the last pre-transition firing and the first post-transition
firing. The bracketing firing pair is recorded for context. This
yields exactly two INTERVAL_DRIFT for `*/15 * * * *` in New York over
2024, zero SKIPPED, and zero DOUBLED, as required.

Schedules that fire at most once per hour (a single minute value,
including `0 * * * *`) are treated as point schedules and use the
per-firing SKIPPED/DOUBLED path, because each hourly run is a
distinct job whose loss or duplication matters individually.

## 2026-07-27: Phase 4, COUNT_ANOMALY is a whole-day structural check

COUNT_ANOMALY groups firings by calendar day, takes the modal daily
firing count, and flags a day whose count deviates, but only when the
day is structurally anomalous: its midday resolves to nonexistent (a
phantom day, the whole day skipped) or to ambiguous (a fully
duplicated day). This is the "calendar day that does not exist" case,
for example Pacific/Apia's December 30 2011, which the schedule
`0 0 * * *` misses entirely.

The structural guard is what keeps this distinct from the per-firing
check. A normal day with one skipped DST hour (New York March 10 for
`30 2`) also has a deviating count for that schedule, but its midday
exists, so it is not a phantom day and is reported only as the
per-firing SKIPPED, not additionally as a COUNT_ANOMALY. Apia's
December 30 is reported as both a per-firing SKIPPED (the 00:00 slot
is nonexistent) and a COUNT_ANOMALY (the day itself does not exist);
both are true and both are shown. COUNT_ANOMALY is computed only for
point schedules; interval-like schedules express their transition
effects as INTERVAL_DRIFT.

## 2026-07-27: Phase 4, ZONE_UNSTABLE scope

The brief names two triggers: a transition whose rule changed in a
recent tzdb release, and a window extending past the last recorded
transition into POSIX footer extrapolation. The second is concrete
and checkable from the compiled zone data, so it is implemented: a
firing at or after the zone's last table transition, when the POSIX
footer defines a DST rule, is labeled footer-extrapolation. When the
footer is a constant offset (UTC, or Asia/Tehran after it abolished
DST in 2022), extrapolation is exact and no label is emitted, because
a constant offset is not a prediction that can be wrong.

The first trigger, a recently changed rule, requires diffing two
tzdb releases to know which transitions moved; that data is not
available in a single compiled tree, so the reason is modeled in the
type (recent-rule-change) but not emitted in this phase. Recorded
here as a known limitation rather than faked. Measured boundary:
America/New_York's last table transition in tzdata 2025b is
2037-11-01T06:00:00Z, with footer EST5EDT,M3.2.0,M11.1.0; a 2038
daily job is labeled ZONE_UNSTABLE.

## 2026-07-27: Phase 4, hazard id

The hazard id is "hz_" plus the first 16 hex characters of the
SHA-256 of the identity tuple: expression, dialect, zone, intended
local time (fixed-width, zone-free), and classification. It excludes
resolved instants, severity, gap and fold durations, and the causing
transition, so a tzdb update that shifts an instant, or a change to
the idempotence flag that shifts severity, does not change the id. A
hazard therefore keeps a stable id across runs and across unrelated
refactors, so it can be baselined and suppressed in CI. A test pins
the literal id hz_feef0ab468b6e246 for a known hazard so any change
to the hash function fails loudly.

## 2026-07-27: Phase 5, policy models are behavioral outcomes, not simulations

Each scheduler model answers one question about one firing that a
zone made nonexistent or ambiguous: FIRES_ONCE_AT, FIRES_TWICE_AT,
DOES_NOT_FIRE, FIRES_AT_CATCHUP, or UNDEFINED. A firing whose local
time is unique is not a decision point; every scheduler fires it once
at the same instant, so the differential compares policies only at
the hazard firings. This keeps the models small and pure: a decision
is a function of the resolution plus, for Debian, the source shape,
and needs no clock or simulation.

## 2026-07-27: Phase 5, VERIFIED vs ASSERTED, and why everything is ASSERTED now

Every model carries a verification status. VERIFIED means phase 6 ran
the real scheduler and confirmed the behavior; ASSERTED means the
model came from documentation or, for naive, from definition. In this
phase every model is ASSERTED, because phase 6 has not run. A test
enforces that no model is VERIFIED yet (no model may default to
VERIFIED), and each model carries a basis string naming where it came
from, which the differential script prints so ASSERTED is never shown
as fact. naive is ASSERTED as a definitional straw model: there is no
real "naive scheduler" to run, it is the pure wall-clock behavior we
define, so it cannot be VERIFIED against an external tool and is
honestly ASSERTED.

## 2026-07-27: Phase 5, debian-cron model grounded in cron(8)

The Debian model follows cron(8) verbatim, fetched 2026-07-27
(https://manpages.debian.org/bookworm/cron/cron.8.en.html):

  "Special considerations exist when the clock is changed by less
  than 3 hours [...] If the time has moved forwards, those jobs which
  would have run in the time that was skipped will be run soon after
  the change. Conversely, if the time has moved backwards by less
  than 3 hours, those jobs that fall into the repeated time will not
  be re-run. Only jobs that run at a particular time (not specified
  [...] with '*' in the hour or minute specifier) are affected. Jobs
  which are specified with wildcards are run based on the new time
  immediately. Clock changes of more than 3 hours [...] the new time
  is used immediately."

So special handling requires a fixed-time job (neither the minute nor
the hour field begins with '*', which is the textual startsWithAsterisk
flag phase 3 preserves, not a semantic test) and a shift under three
hours. Forward: the skipped fixed-time job fires once as a catch-up
at the transition instant. Backward: the fixed-time job in the
repeated hour fires once, at the first occurrence. Wildcard jobs, and
any shift of three hours or more, get no compensation and behave
exactly as the naive model. This is why the wildcard schedule in the
acceptance (*/10) makes debian-cron and naive agree.

## 2026-07-27: Phase 5, the other eight models and where UNDEFINED lives

- naive: gap does not fire, fold fires twice. Definitional.
- k8s-cronjob: the controller computes schedule times in the
  configured timeZone with robfig/cron. robfig documents that "jobs
  scheduled during daylight-savings leap-ahead transitions will not
  be run" (https://pkg.go.dev/github.com/robfig/cron/v3, fetched
  2026-07-27), so a gap does not fire; with no fold suppression a
  repeated time fires twice (Kubernetes CronJob docs, fetched
  2026-07-27). startingDeadlineSeconds and the missed-schedule limit
  are modeled as parameters but govern controller-downtime catch-up,
  not a DST gap or fold, so they do not change the DST outcome.
- node-cron: its README "Timezones and DST" (fetched 2026-07-27,
  https://github.com/node-cron/node-cron) says the repeated hour runs
  once and the gap pauses, so fold fires once and gap does not fire.
- cronie: separate codebase from Debian; not run this session; do not
  assume it matches Debian. Both hazard branches UNDEFINED.
- quartz: misfire instructions modeled as parameters (SMART_POLICY
  the documented default, Quartz tutorial fetched 2026-07-27), but
  misfire governs missed-fire recovery, not DST. No DST source
  fetched, so gap and fold UNDEFINED.
- croniter and cron-parser-luxon: their READMEs claim correct DST
  handling but do not document the gap or fold convention (both
  fetched 2026-07-27), matching the phase 1 finding that the policy
  is implicit in the implementation. Both hazard branches UNDEFINED.
- systemd-timer: Persistent= modeled as a parameter (systemd.timer(5)
  fetched 2026-07-27), governing boot-time catch-up of missed timers,
  not DST. The man page does not specify DST elapse, so gap and fold
  UNDEFINED.

UNDEFINED is a real answer here, not a placeholder for a guess: five
of the nine models decline to assert a DST branch this project could
not ground or observe. Phase 6 will replace those it can confirm.

## 2026-07-27: Phase 5, differential verdict semantics

The differential runs every policy over a schedule and compares
firing instants at the decision points. Two policies AGREE when they
fire the same instants at every decision point, DIFFER when both are
defined and any decision point differs, and UNDETERMINED when either
is UNDEFINED somewhere (agreement cannot be certified). The verdict
is total-agreement (safe to port) only when there are no decision
points, or every policy is defined and identical at all of them; any
definite difference or any UNDEFINED branch makes it a disagreement,
which is a portability hazard distinct from the DST hazard. Berlin
30 2 at the 2023 fall-back has debian-cron fire once, k8s and naive
fire twice, node-cron fire once, and the rest UNDEFINED: definite
disagreements between debian-cron, k8s, naive, and node-cron, so it
is not safe to port. A 04:00 schedule has no decision points in the
zones tested, so it is total agreement, the safe case.

## 2026-07-27: Phase 6, empirical verification method and the fixture boundary

Each scheduler was run for real and its fire instants recorded into a
committed fixture under test/differential/fixtures. The policy model
tests assert against those fixtures, so CI needs no Docker; a
`pnpm verify:real` task (test/differential/regenerate.sh) regenerates
them from the containers and host tools. The 2023 transition dates are
historical and identical across every tzdb release the harnesses ran
under (node ICU 2025c, python tzdata 2026.3, systemd/host 2026b, go
embedded, debian 2026b, cronie 2024b), so the observations compare
directly against the vendored 2025b engine.

Observation methods, one per runtime class:
- Computed-sequence libraries (cron-parser, croniter, cronsim, and
  robfig/cron for k8s) were called directly and their next-time
  sequences over the window recorded.
- systemd via `systemd-analyze calendar --base-time --iterations` with
  an explicit TZ, which gives elapse times without a running system.
- The Vixie daemons (debian cron, cronie) were run as real daemons
  under libfaketime. libfaketime 0.9.10's speed multiplier is broken
  in these images, so acceleration is done differently: a no-sleep
  LD_PRELOAD shim collapses the daemon's per-minute sleep to
  near-instant, and a controller steps a real-relative UTC offset in
  the libfaketime timestamp file so the daemon races through every
  minute in seconds while still seeing the clock jumps its DST logic
  keys off. The offset is UTC-relative on purpose: a local wall string
  is ambiguous across the fold (02:30 aliases to both passes), a
  real-relative UTC offset is not.
- node-cron arms a single real-duration timer that a faked wall clock
  cannot accelerate, so it was run under a virtual clock: its own
  scheduler code with Date and the timer functions intercepted and a
  discrete-event loop advancing virtual time to each timer it arms.
  The firing decisions are node-cron's; only the clock substrate is
  virtual, the standard fake-timers technique.

## 2026-07-27: Phase 6, models refactored to profiles, and what stayed ASSERTED

Observation showed the libraries' fold behavior depends on schedule
shape (a cursor library fires a folded interval slot twice but a
folded daily job once or twice depending on the library), so the
library models became a small data-driven profile keyed on
(resolution, fixed-vs-interval): src/policy/models/profile.ts. cronie
was observed to behave identically to debian-cron, so the two Vixie
daemons share one decider (vixie-family), each still resting on its
own fixture. cronsim was added as a new VERIFIED model. Eight of ten
models are VERIFIED against a fixture; two remain ASSERTED and say so:
quartz was not run (it needs a JVM and a live Quartz scheduler, so its
DST gap and fold stay UNDEFINED) and naive is a definitional straw
model with no real scheduler to run. No grounded phase-5 model was
contradicted; the divergences the runs surfaced (croniter double-fires
a daily job at fall-back, cron-parser shifts a skipped time forward)
are recorded in FINDINGS.md as portability hazards and upstream-report
material.

## 2026-07-27: Phase 7, CLI architecture and format-agnostic result model

Every command builds one format-agnostic ResultModel (a title, echoed
inputs, a hazard list, ordered display sections, and a structured data
payload); five formatters render it to human, json, sarif, junit, or
markdown. That separation is what lets the same analysis render five
ways and keeps json byte-for-byte reproducible: the json object is
built in a fixed key order, contains no wall-clock timestamp, and the
receipt hashes are taken over a key-sorted serialization, so two runs
on identical inputs and tzdb produce identical bytes. A test runs the
command twice and asserts the buffers are equal.

## 2026-07-27: Phase 7, exit codes and the internal-verification gate

Exit codes: 0 clean, 1 hazards at or above --fail-on (default high; the
gate commands check and scan only, so explain and zones stay
informational and exit 0), 2 usage or parse error, 3 internal
verification failure. Exit 3 is a real guard, not a placeholder:
before computing hazards, the CLI runs the phase-2 backend cross-check
on the zone over the window and compares the two tzdb versions, and
fails with code 3 if the backends disagree or ICU and the zoneinfo
tree report different tzdb releases. The zoneinfo root therefore
defaults to the copy vendored with this package, which matches the
runtime ICU tzdb, so a default run does not trip the check; pointing
--zoneinfo-root at a divergent tree (for example the system
/usr/share/zoneinfo when it is ahead of ICU) is caught and reported.

## 2026-07-27: Phase 7, SARIF and JUnit schema validation

SARIF maps hazard severity to the SARIF level (critical and high to
error, medium to warning, low and info to note) and uses the stable
hazard id as the rule id, so a specific hazard is suppressible by id
through the standard SARIF/GitHub mechanism. Output is validated in
tests against the official SARIF 2.1.0 schema (vendored at
tests/cli/schemas/sarif-2.1.0.json, fetched 2026-07-27 from
raw.githubusercontent.com/oasis-tcs/sarif-spec) with ajv, not by
inspection. JUnit is XML and there is no single official JUnit XSD, and
a pure-JS XSD validator needs a native library; so the JUnit XML is
parsed with fast-xml-parser and the parsed structure is validated
against a JSON Schema of the JUnit format (tests/cli/schemas/
junit.schema.json), which is stricter than eyeballing and needs no
native dependency. ajv, ajv-formats, and fast-xml-parser are
test-only devDependencies; the CLI itself pulls in no runtime deps.

## 2026-07-28: Phase 8, repository scanners

The scanner in src/scan/ walks a tree (or a single file), routes each
file to the scanners its path and a cheap content sniff select, and
records every schedule with a file, line, and column so a finding maps
back to the exact source token. Column points at the first character
of the schedule value as it appears in source (the opening quote for a
quoted value; the first field character for an unquoted crontab or
OnCalendar value).

### Lexical scanning, not a full parser or a YAML/TOML/HCL dependency

The repo has no runtime dependencies and this phase keeps it that way.
Two consequences, both deliberate:

- Config formats (YAML, JSON, TOML, HCL) are read with line- and
  key-oriented matching plus brace/paren counting, not a format
  parser. This is enough to locate spec.schedule, crons, schedule,
  time_zone, and schedule_expression with positions, and it cannot be
  fooled into "parsing" a value it should not: a Helm-templated
  schedule ({{ ... }}) or a Spring property placeholder (${...}) is
  reported UNRESOLVED, never guessed at.
- The application-level JS/TS pass (node-cron, cron-parser) is a
  lexical pass, not a TypeScript AST. It masks comment and string
  bodies first so a commented-out or quoted call is not read as live,
  then brace-matches on the masked text. A full AST would mean taking
  typescript as a runtime dependency for a cron library, which is not
  justified. The first string argument is accepted only when it is
  schedule-shaped (a space-separated cron or an @macro), so a date or
  URL passed as an option before a variable expression is not
  mistaken for the schedule. Trade-off recorded: a call whose
  expression is a non-literal (a variable or a built string) is not
  reported, because there is no literal to locate or prove.

### Zone source is a first-class, cited part of every finding

Every finding records where its timezone came from: explicit in the
file, inherited from a CRON_TZ or TZ line earlier in the same file,
defaulted by a platform rule, or UNKNOWN. UNKNOWN is itself a finding,
because a schedule whose zone cannot be determined cannot be proven
safe. The platform-default rules below each carry a URL fetched in
this session (2026-07-28):

- GitHub Actions runs scheduled workflows in UTC: "By default,
  scheduled workflows run in UTC."
  https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows
- Kubernetes CronJob without spec.timeZone is NOT assumed UTC; it is
  UNKNOWN: "For CronJobs with no time zone specified, the
  kube-controller-manager interprets schedules relative to its local
  time zone." That is a cluster property the manifest cannot reveal.
  https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
- Cloudflare Workers Cron Triggers run in UTC: "Cron Triggers execute
  on UTC time."
  https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Vercel Cron Jobs run in UTC: "The timezone is always UTC."
  https://vercel.com/docs/cron-jobs
- Render cron jobs run in UTC: "All day and time ranges use UTC."
  https://render.com/docs/cronjobs
- Netlify Scheduled Functions run in UTC: schedules are "executed
  according to the UTC timezone."
  https://docs.netlify.com/functions/scheduled-functions/
- Google Cloud Scheduler defaults to UTC when time_zone is unset: "If
  a time zone is not specified, the default will be in UTC (also known
  as GMT)." The Terraform provider surfaces this default as the tz
  database name Etc/UTC.
  https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs
  https://raw.githubusercontent.com/hashicorp/terraform-provider-google/main/website/docs/r/cloud_scheduler_job.html.markdown
- AWS EventBridge rules evaluate cron in UTC: "All scheduled events
  use UTC+0 time zone."
  https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html
- AWS EventBridge Scheduler (aws_scheduler_schedule) defaults to UTC
  unless schedule_expression_timezone is set: "Timezone in which the
  scheduling expression is evaluated. Defaults to UTC."
  https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/main/website/docs/r/scheduler_schedule.html.markdown
- systemd calendar events accept a trailing timezone and otherwise run
  in local time: "Timezone can be specified as the literal string
  UTC, or the local timezone ... or the timezone in the IANA timezone
  database format." So a systemd OnCalendar with no trailing zone and
  no unit Timezone is UNKNOWN.
  https://manpages.debian.org/testing/systemd/systemd.time.7.en.html
- Spring @Scheduled has a zone attribute and otherwise uses the
  server's default zone: "You can also use the zone attribute to
  specify the time zone in which the cron expression is resolved." No
  zone means the finding's zone is UNKNOWN.
  https://docs.spring.io/spring-framework/reference/integration/scheduling.html
- Celery crontab fields default to '*' (each of minute, hour,
  day_of_week, day_of_month, month_of_year), and periodic tasks run in
  the configured timezone: "The periodic task schedules uses the UTC
  time zone by default, but you can change the time zone used using
  the timezone setting." That setting is app-level, not on the crontab
  call, so a scanned crontab() entry has an UNKNOWN zone.
  https://docs.celeryq.dev/en/stable/userguide/periodic-tasks.html
  https://docs.celeryq.dev/en/stable/reference/celery.schedules.html

### CRON_TZ and TZ inheritance

A crontab is walked top to bottom. A CRON_TZ or TZ assignment sets the
zone for entries that appear after it, and a later assignment
overrides an earlier one, so a mid-file redeclaration affects only the
entries below it. An entry before any such line has an UNKNOWN zone,
because a bare crontab runs in the daemon's local time.

### Suppressions must state a reason

.cronproofignore uses a small gitignore-flavored matcher (root-anchor,
trailing-slash dir rules, * and ** globs), with .git and node_modules
always ignored. An inline "cronproof-ignore" comment silences the
finding on its own line or the line directly above it, but only when
it carries a reason: a bare "cronproof-ignore" never suppresses and is
always reported as a suppression-missing-reason diagnostic, so a
hazard cannot be quietly buried.

### Scan reports discovery; hazard gating is a later phase

Phase 8 delivers discovery: what schedules exist, where, and how their
zone is known. The scan command therefore reports findings and exits
0; turning UNKNOWN and UNRESOLVED findings into non-zero exit gates is
deferred to a later phase, consistent with the phase-8 acceptance
criteria, which cover location, zone source, and UNRESOLVED, not exit
codes.

### Real public repo run

Acceptance requires a real public repo scanned without crashing.
scripts/real-repo-scan.ts fetches one pinned SHA and scans it:
harrisiirak/cron-parser at
aeb2a1513fd33365a6414f4137516c9482f831ed. Measured this session: 33
files scanned, 137 findings (all cron-parser call sites), 0
diagnostics, no crash. The run is a standalone script rather than part
of npm run evidence because it needs network; pinning the SHA keeps it
deterministic.

## 2026-07-28: Phase 9, CI gate and composite action

Phase 8 delivered discovery; phase 9 turns scan into a gate. Each
discovered schedule with a real zone and a parseable expression is run
through the phase-4 hazard classifier over a fixed window (2025-01-01
to 2027-01-01, chosen to span several spring-forward and fall-back
transitions so DST hazards are actually reached; overridable with
--from/--to). The resulting hazards are emitted as SARIF results
carrying the finding's physical file, line, and column, so a
code-scanning annotation lands on the exact source line.

### UNKNOWN and UNRESOLVED are hazards, not just notes

A finding whose zone is UNKNOWN (cannot be proven safe) or whose
expression is UNRESOLVED (a template) is surfaced as its own hazard at
medium severity, with a stable id hashed from the file and the
expression. This keeps the tool's core thesis (a schedule that cannot
be proven safe is a finding) inside the gate, not just the report.

### SARIF paths are repo-relative

For an annotation to map onto a pull-request file, the SARIF
artifactLocation uri must be relative to the repo root. scanRepo gained
a pathBase option; the CLI passes the working directory, so scanning a
subdirectory from the repo root still yields repo-relative paths. The
library default (relative to the scan root) is unchanged, so the
phase-8 tests and API are untouched.

### Baseline

cronproof baseline writes the current hazard ids to a small, sorted,
timestamp-free JSON file; scan --baseline accepts those ids so only
hazards introduced after the baseline fail. Hazard ids hash the
schedule's meaning (expression, dialect, zone, intended local time,
kind), not its line, so a baseline survives refactors and stays valid
until the schedule itself changes. Without this, no existing codebase
adopts the gate, because day-one it is all red.

### tzdb drift check

--tzdb-check <release> compares the runner's ICU tzdb against a pin and
fails with exit 3 on any difference. The failure mode is real: time
zone rules are political and change between tzdata releases. Concrete
example, tzdb release 2020a: "Canada's Yukon advanced to -07 year-round,
beginning with its spring-forward transition on 2020-03-08, and will not
fall back on 2020-11-01." Source, fetched 2026-07-28:
https://data.iana.org/time-zones/tzdb/NEWS
A verdict computed before that release and trusted after it would be
stale; the pin forces a deliberate re-verification instead of a silent
stale pass. It is compared against the ICU tzdb because that is the
release the runtime carries and the one that varies from runner to
runner.

### The action builds from source

action/action.yml is a composite action. Rather than depend on an
unpublished npm package or a committed prebuilt bundle that could drift
from source, it builds cronproof from the action's own repo checkout
(github.action_path/..) and runs the CLI against the consumer's
workspace. SARIF is uploaded even when the gate fails (the upload step
runs before the failing step) so annotations still appear on a failing
PR.

### CI layout

- ci.yml: the existing evidence:check job plus a dogfood job that runs
  the action on this repo (scan ., clean via .cronproofignore which
  excludes the test fixtures that carry intentional hazards).
- scheduled-scan.yml: a weekly run that re-scans and re-checks the tzdb
  pin, so a tzdb release that moved a DST boundary is caught on a cron.
- cronproof-demo.yml: runs on pull requests and demonstrates the three
  acceptance cases: the gate fails on the hazard fixture and uploads
  SARIF annotations; a baseline suppresses the known hazards while a
  newly introduced schedule still fails; a wrong tzdb pin fires with
  exit 3 while the correct pin passes.

## 2026-07-28: Phase 9 acceptance evidence (live CI)

All three cases were demonstrated on real GitHub Actions runs in
moonrunnerkc/cronproof. URLs verified this session with gh.

Main branch CI, both jobs green (evidence:check and the dogfood scan of
this repo):
https://github.com/moonrunnerkc/cronproof/actions/runs/30385198522

Demo pull request (PR #1) and its "cronproof demo" workflow run:
https://github.com/moonrunnerkc/cronproof/pull/1
https://github.com/moonrunnerkc/cronproof/actions/runs/30385345264

Case 1, the gate fails on hazards and uploads SARIF. The "gate fails on
hazards and uploads SARIF" job ran the composite action on the fixture,
logged "cronproof exit code: 1", "Uploading results", and "cronproof
gate failed with exit code 1" (the check is red). Eight code-scanning
alerts appeared on the PR, anchored to the exact source line. Their
verbatim annotation text, on tests/ci/fixture/pr-demo.crontab:3:1 and
tests/ci/fixture/app.crontab:3:1:
  SKIPPED at 2025-03-30T02:30:00 (Europe/Berlin): local time does not exist (spring-forward gap of 60m); run is skipped
  SKIPPED at 2026-03-29T02:30:00 (Europe/Berlin): local time does not exist (spring-forward gap of 60m); run is skipped
  DOUBLED at 2025-10-26T02:30:00 (Europe/Berlin): local time occurs twice (fall-back fold of 60m); run may double
  DOUBLED at 2026-10-25T02:30:00 (Europe/Berlin): local time occurs twice (fall-back fold of 60m); run may double

Case 2, baseline suppresses known while a new one fails. The "baseline
suppresses known, a new hazard fails" job (green) logged:
  baseline written / hazards accepted 4
  (scan with baseline) hazards (gating) 0, hazards (baselined) 8, exit=0
  PASS: baseline suppressed all known hazards (exit 0)
  (after adding a new schedule) hazards (gating) 2, hazards (baselined) 8, exit=1
  PASS: new hazard failed the gate (exit 1) while baselined ones stayed quiet

Case 3, the tzdb pin fires on drift. The "tzdb pin passes when matched,
fires when wrong" job (green) logged:
  runner tzdb: 2025b / cronproof: tzdb pin ok (2025b) / exit=0
  PASS: correct tzdb pin passed (exit 0)
  cronproof: tzdb drift: pinned 1999z but the runner's ICU tzdb is 2025b. [...] exit=3
  PASS: wrong tzdb pin fired (exit 3)

The demo hazard fixture (tests/ci/fixture) lives under a path the root
.cronproofignore excludes, so the dogfood scan of the whole repo stays
green while the demo job scans that directory directly.

## 2026-07-28: Phase 10 property tests, adversarial zones, mutation testing

### Property tests (fast-check)

Six properties under tests/property, each with a pinned seed and case
count so a failure reproduces exactly. The backend is built on the
vendored 2025b zoneinfo root.

- Partition and the resolved-count invariant (hazard-invariants.property,
  seed 0x1a2b3c4d, 300 runs). Every intended firing resolves to exactly
  one of unique, nonexistent (SKIPPED), or ambiguous (DOUBLED); the three
  buckets are disjoint and cover the whole firing set. For point
  schedules the classifier's SKIPPED and DOUBLED hazards match the
  nonexistent and ambiguous buckets one for one. The named invariant,
  resolved = intended - skipped + doubled, is checked in resolved-instant
  terms (unique contributes one instant, ambiguous two, nonexistent
  none). Four explicit fast-check examples (New_York spring gap and fall
  fold, on both the interval-like and point paths) guarantee the corpus
  exercises real skips and doubles rather than passing vacuously: the run
  reports firings=24797 skipped=61 doubled=62.
- Reverse iteration (hazard-invariants.property). Unioning the per-day
  slices of a window in reverse day order yields the same firing set as
  one forward pass. The enumerator exposes no reverse API, so this is
  expressed as traversal-order independence of enumerate over adjacent
  sub-windows, the checkable behavior behind "reverse iteration produces
  the same set". Choice recorded per standing rule 1: adding a reverse
  enumerator to production purely to satisfy a test was rejected in
  favor of testing the equivalent observable property of the existing
  code.
- UTC yields zero hazards (hazard-invariants.property, 300 runs).
  classifyHazards in UTC is empty for every generated expression and
  window.
- The two backends never disagree (backend-agreement.property, seed
  0x5eed7a11). 5,000 random (zone, instant) pairs across all 597
  Intl-nameable vendored zones agree on offsetSeconds; 400 random
  (zone, window) pairs produce zero crossCheckZone disagreements.
  "Factory" is the one vendored zone ICU does not expose; excluding it
  keeps a disagreement a real finding, not a naming artifact. A prior
  full sweep of all 598 vendored zones over 1970 to 2040 confirmed zero
  disagreements this session.
- Hazard ids collision-free (hazard-id.property, seed 0xc0111de5). A
  deterministic 60,000-identity sweep and 20,000 random identities each
  produce as many distinct ids as distinct identities, zero collisions.

### Adversarial zone corpus

One named test per zone under tests/adversarial, each asserting that
zone's specific weirdness against the vendored TZif data (measured this
session). gaps-and-folds.test.ts: America/New_York (1h spring gap, 1h
fall fold), Europe/Dublin (negative DST, DST flag set in winter at
offset 0), Australia/Lord_Howe (30-minute shift), Pacific/Chatham
(45-minute offset component), Antarctica/Troll (2-hour gap),
Europe/Lisbon (ordinary EU rule, as a control). date-line-and-rules
.test.ts: Pacific/Apia (the 1892 move steps the offset back a full day,
the 2011 move forward a full day and erases 2011-12-30),
Pacific/Kiritimati (1994 move UTC-10 to UTC+14 erases 1994-12-31),
Asia/Tehran and America/Sao_Paulo (DST abolished, constant footer, no
ZONE_UNSTABLE), Africa/Casablanca (four transitions in 2017 from the
Ramadan pause, the +1h base dropping to 0 during Ramadan 2024), Asia/Gaza
(spring transition in April on dates that move earlier each year, not the
EU last Sunday of March), America/Santiago (southern hemisphere, January
daylight time and July standard time), Asia/Kolkata (constant +5:30
half-hour offset, last transition in 1945 so the footer governs every
modern firing), and a DST footer governing firings past the last
recorded transition (America/New_York, a 2039 window beyond the 2037
table end is ZONE_UNSTABLE with the 2037 transition as its boundary).

### Mutation testing

Stryker 9.6.1 with the vitest runner and perTest coverage, mutating only
src/hazard and src/tz (stryker.config.json). The mutation harness is
vitest.mutation.config.ts, scoped to the tz, hazard, and adversarial
suites. The fast-check property suites are deliberately excluded from the
mutation harness: their large generated windows and instant ranges
amplify a mutant with a broken loop bound into an out-of-memory hang that
crashes the vitest worker before Stryker's timeout can fire, which only
adds runner-restart overhead without changing the verdict. The cron
suites are excluded because they import only src/cron and so never cover
a src/hazard or src/tz mutant under perTest.

The score is reported as measured. No target was invented and nothing is
gated on it.

Total: 1404 mutants. 884 killed, 34 timeout, 320 survived, 166 no
coverage, 0 errors.
- mutation score (total)   = 65.38%  (killed + timeout) / all valid
- mutation score (covered) = 74.15%  (killed + timeout) / (killed + timeout + survived)

Per file:

```
File                                score%  killed timeout  surv  nocov  total
src/hazard/build-hazard.ts          100.00       3       0     0      0      3
src/hazard/classify.ts               36.11      13       0    11     12     36
src/hazard/count-anomaly.ts          74.55      41       0    12      2     55
src/hazard/hazard-id.ts              92.31      12       0     1      0     13
src/hazard/interval-drift.ts         52.85      62       3    40     18    123
src/hazard/per-firing.ts            100.00      25       0     0      0     25
src/hazard/resolve-firings.ts       100.00       5       0     0      0      5
src/hazard/severity.ts               63.16      12       0     7      0     19
src/hazard/transitions.ts            35.00       7       0    13      0     20
src/hazard/zone-unstable.ts          78.57      44       0     8      4     56
src/tz/civil-date.ts                 90.08     109       0     8      4    121
src/tz/cross-check.ts                57.45      27       0    11      9     47
src/tz/intl-backend.ts               76.92      70      20    21      6    117
src/tz/posix-tz.ts                   78.16     158       3    35     10    206
src/tz/resolve-wall-clock.ts         67.52      79       0    28     10    117
src/tz/tzif-backend.ts               55.19      93       8    74      8    183
src/tz/tzif-parse.ts                 79.63      86       0    18      4    108
src/tz/versions.ts                   58.33      21       0    14      1     36
src/tz/zoneinfo-source.ts            14.91      17       0    19     78    114
ALL                                  65.38     884      34   320    166   1404
```

The single biggest drag is src/tz/zoneinfo-source.ts at 14.91%, whose
listZones, isTzifFile, and version-reading paths are exercised by the
excluded backend-agreement property and by the crosscheck script rather
than by the mutation harness, so most of its 78 no-coverage mutants
reflect the harness scope, not an untested unit. The full per-mutant
list of all 486 surviving and no-coverage mutants is committed at
reports/mutation/mutation-report.md, with the raw Stryker output at
reports/mutation/mutation.json.

## 2026-07-28: Phase 11 browser playground

### Browser-safe core: a pure-TypeScript sha256

The hazard id hashed the identity tuple with node:crypto, which does not
exist in a browser. Rather than make hazardId async (Web Crypto is
async and the change would ripple through every caller) or alias
node:crypto to a shim, the hash is now a vendored pure-TypeScript
SHA-256 (src/hazard/sha256.ts) used in both Node and the browser. A test
(tests/hazard/sha256.test.ts) pins it against node:crypto over the
published FIPS vectors, the padding boundaries, multibyte UTF-8, and a
thousand varied inputs, and the existing pinned hazard id KNOWN_ID is
unchanged, so ids stay stable across environments.

### One verdict builder, two backends

The CLI and the web must produce identical verdicts, so both now call
one function. src/analyze/verdict.ts owns classifyForVerdict (runs the
classifier and the scheduler differential once) and verdictData (shapes
that into the exact `data` payload check emits). The CLI's check command
was refactored onto it with byte-identical output (the format and schema
tests still pass). The pure hazard-view helpers moved to
src/analyze/hazard-view.ts; cli/analyze.ts re-exports them. This is the
single source of truth the parity test pins.

### Single-backend mode, stated in a banner

The browser has only the Intl (ICU) backend. Two consequences are made
explicit in a banner on the page: there is no second backend to
cross-check against, and there is no compiled TZif table to read, so the
browser cannot compute ZONE_UNSTABLE (a firing past the last recorded
transition, governed by the POSIX footer). ZONE_UNSTABLE is inherently a
TZif-table feature: Intl exposes offsets, not the table-versus-footer
boundary. The 50-case parity matrix therefore stays inside the recorded
table (windows <= 2025), where the CLI also emits no ZONE_UNSTABLE, and
the test asserts zoneUnstable == 0 as a guard so a future late-window
case fails loudly instead of silently diverging.

### The bundle stubs node builtins the Intl path never calls

The shared classifier statically imports the TZif reader:
src/hazard/zone-unstable.ts references readZoneFile and parseTzif at
module scope, so a browser bundle pulls node:fs, node:path, and node:url
transitively even though the Intl path never reaches them (single-backend
mode passes no zoneinfo root, so zoneUnstableHazards returns early before
the reader). Tree-shaking cannot drop a statically referenced import, so
scripts/build-web.ts (esbuild) redirects every node: import to an inert
stub whose members throw a clear error if ever called. The built app.js
contains no node: import, no require, and no external URL (verified by
grep); the only http reference is the SVG xmlns.

### Offline, permalink, and next-transition

Offline after first load is a service worker (web/sw.js) that precaches
the four shell files; the page makes zero network requests at runtime
(Intl is built in), so cache-first is never stale. The permalink encodes
the full input state (expression, dialect, zone, from, to, idempotent)
into the URL hash, so a specific hazard in a specific zone is a shareable
link, which crontab.guru cannot do for timezones. "Check my next
transition" reads the visitor's zone from
Intl.DateTimeFormat().resolvedOptions().timeZone, finds the next
transition in the next three years, and brackets it with a two-day
window.

### Acceptance

- Builds to a static bundle: `npm run build:web` emits web/dist
  (app.js, index.html, styles.css, sw.js). Measured app.js is 53722 B
  (18572 B gzipped); total shell 63371 B. The build is deterministic
  across runs.
- Works offline after first load: service worker precaches the shell and
  the runtime makes no network calls (both verified structurally; a live
  browser was not available in this environment to click-test, so this
  is asserted by construction, not by a browser run).
- Verdicts identical to the CLI across 50 cases:
  tests/web/parity.test.ts drives the browser code path (Intl backend,
  no zoneinfo root) and the real CLI runCheck (TZif backend, vendored
  root) over 50 fixed cases and asserts the hazards, the severity tally,
  and the full scheduler differential are deep-equal. 50/50 pass, 42
  hazards total, 0 ZONE_UNSTABLE.

## 2026-07-28: Phase 12 corpus study harness

### Four-stage cache-backed pipeline

research/ is a four-stage pipeline (collect, filter, analyze, report),
each independently rerunnable. Only collect touches the network; filter,
analyze, and report are pure functions of the cache, so a skeptic reruns
the last three and gets the same numbers with no GitHub account. The raw
search pages, file blobs (keyed by git blob sha), and repo metadata are
all cached; collect is idempotent and preserves the original fetch
timestamp per hit, so a warm-cache rerun makes zero network calls.

### Pinned analysis window (choice recorded per standing rule 1)

The spec asks for "the next 12 months", but a window anchored to the
wall clock makes the report irreproducible, which conflicts with the
hard reproducibility acceptance criterion. The window is therefore
pinned to a fixed 2025-01-01 to 2026-01-01 (a full year of both
hemispheres' DST) and the report states this. Reproducibility wins over
a literally-rolling window; the transition physics are the same.

### Content fetched by git blob sha, not the contents API

GitHub code search returns each hit's git blob sha, not a commit ref.
The first implementation passed that blob sha to the contents API as a
`?ref=`, which 404s for every hit (a blob sha is not a commit-ish), so
the first collect silently produced an empty corpus. Fixed to use the
git blobs API (`/repos/{repo}/git/blobs/{sha}`), which takes a blob sha
directly. A lesson in verifying the collector end to end before trusting
a zero.

### Robustness to malformed extracted zones

A scanned k8s `timeZone` can be a quoted value with a trailing comment,
which the scanner does not strip, yielding a non-IANA zone string. The
first analyze run crashed on it. The analyzer now guards each schedule:
any engine failure (unknown zone, unreadable table) marks the schedule
not analyzable (`zoneResolvable: false`) and is counted separately
rather than aborting the corpus run.

### Exclusion rules and their order

Rules run in a fixed order so each exclusion is charged to exactly one
rule: vendored directory, then cron-library-or-fixture, then fork, then
content dedup last on the survivors. Order is a documented choice; a hit
matching two rules counts against the first. Fork exclusion uses
GitHub's own fork flag, a conservative anti-inflation measure.

### Results (this corpus, this run)

Reproduced byte-identical across two full pipeline runs from cache
(report.md and metrics.json sha256 unchanged).

- Collected hits (after per-query dedup): 1052. Kept after exclusions:
  962. Excluded: library-or-fixture 23, duplicate 67, vendored 0, fork 0.
- Schedules extracted: 1413. Analyzable (parsed, concrete loadable
  zone): 1170. Unknown zone: 185. Unparsed: 57. Non-loadable zone: 1.
- Headline portability defect rate: of public Kubernetes CronJobs with
  an explicit non-UTC timeZone, 4/91 (4.4%) fire a different number of
  times under the k8s controller than under debian-cron over the window.
  The four are spring-forward skips (k8s fires 0, debian 1) and a
  fall-back double (k8s 2, debian 1) in America/New_York and
  America/Chicago.
- Secondary: 24/1170 (2.1%) analyzable schedules fire inside a
  transition window. The rate is low because most collected schedules
  are UTC-only Vercel and Wrangler crons (569 and 241), which the
  platform breakdown in the report makes legible.

### Evidence boundary

The pipeline is not part of the hermetic `npm run evidence` set (it
needs the network and the cache, which is gitignored), the same way the
real-repo scan is a standalone script. The research unit tests do run
under the evidence test step. The published out/ artifacts (manifest,
exclusions, analysis, metrics, report) are the phase deliverable.
