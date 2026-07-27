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
