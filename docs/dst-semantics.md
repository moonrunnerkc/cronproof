# DST semantics: what a cron schedule actually does across a transition

This is the reference cronproof is built on. Every behavioral claim below
is either a number measured in this repository (traceable to
[EVIDENCE.md](../EVIDENCE.md), regenerated from real command output by
`pnpm evidence`) or a link to a primary source fetched while writing it.

## The three wall-clock resolution cases

A cron expression names a wall-clock time. In a zone with offset
transitions, a wall-clock time resolves in exactly one of three ways, and
every downstream hazard follows from which one applies:

- **Unique.** The local time maps to exactly one instant. The ordinary case.
- **Nonexistent (a gap).** A forward transition skipped this local time; it
  never occurs. A job scheduled there is the SKIPPED hazard.
- **Ambiguous (a fold).** A backward transition repeated this local time; it
  occurs twice, at two different instants. A job scheduled there is the
  DOUBLED hazard, because a scheduler may fire it once or twice.

cronproof resolves every intended firing into one of these three and never
hands a caller a bare instant without saying which case occurred. The
Berlin example in [EVIDENCE.md](../EVIDENCE.md) section 6 shows a real gap
(`30 2 * * *` America/New_York 2024, `SKIPPED ... gap 60min`) and a real
fold (`30 1 * * *` America/New_York 2024, `DOUBLED ... fold 60min` at two
instants `05:30Z` and `06:30Z`).

## isDst is not a proxy for summer: Europe/Dublin

It is tempting to treat "is DST in effect" as "is it summer" and to assume
DST always means the clock is one hour ahead. Both assumptions are wrong,
and Europe/Dublin breaks them. In the vendored tzdb (2025b) Dublin runs at
offset 0 in **winter**, and the tz data marks that winter period as the
DST variant (GMT), while **summer** is standard time (IST) at +1h. This
repo asserts exactly that: EVIDENCE.md section 3 records the test
"vendored TZif reports Europe/Dublin winter as the DST variant at offset 0
and summer as standard time at +1h", and the POSIX footer test "parses the
reversed-season Dublin footer where standard time is the summer offset".

So the DST flag can be set in the colder half of the year. The IANA tz
database's own theory document says the flag should not be leaned on: the
`tm_isdst` member's uses "should be discouraged", and disambiguating with
it "does not work in general for geographical timezones"
([tz theory](https://data.iana.org/time-zones/theory.html)). cronproof
therefore never uses the DST flag for offset math or as a season indicator;
it reports the flag as raw data only and computes everything from offsets.

## Sub-hour transitions: Australia/Lord_Howe

A transition is not always one hour. Lord Howe Island shifts by 30 minutes.
A schedule at `15 2 * * *` lands inside a 30-minute gap and is skipped;
`45 2 * * *` is fine because 02:45 exists after the shift. EVIDENCE.md
section 6 shows `15 2 * * * Australia/Lord_Howe 2024 ... SKIPPED ... gap
30min` and `45 2 * * * ... (no hazards)`, and section 3 records the
transition moving the clock "by exactly 1800 seconds". Any code that
assumes a DST gap is a whole hour mishandles this zone; the cross-check in
EVIDENCE.md section 4 compares 118 Lord_Howe transitions between the two
backends with zero disagreements.

## Multi-hour transitions: Antarctica/Troll

Troll station shifts by two hours. A `0 2 * * *` schedule on the March 2024
transition falls inside a two-hour gap. EVIDENCE.md section 3 records the
test "the March 2024 transition opens a two-hour gap, so 02:00 on
2024-03-31 is nonexistent for two hours", and section 4 cross-checks 70
Troll transitions. A gap wider than an hour means more than one hourly slot
can vanish at once, which a per-firing check must handle rather than
assuming a single skipped slot.

## Zones that abolished DST

DST is not permanent policy. A government can end it. This repo's
adversarial suite (EVIDENCE.md section 3) records that Asia/Tehran has "no
transition after 2022" and America/Sao_Paulo "no transition after 2019",
each then running at a constant offset. A schedule that was hazardous in
one of these zones in 2018 is hazard-free in 2025, so a verdict is only
meaningful against the tzdb release that encodes the current policy. The
IANA NEWS file shows this churn is ongoing: in release 2026c "Alberta
moved to permanent -06 on 2026-06-18"
([tz NEWS](https://data.iana.org/time-zones/tzdb/NEWS)).

## Missing calendar days: Pacific/Apia

A transition can be a full day. When Samoa crossed the date line at the end
of 2011, December 30 2011 did not exist. A daily `0 0 * * *` job has no
December 30 to run on. EVIDENCE.md section 6 shows `0 0 * * * Pacific/Apia
2011` producing both a `SKIPPED ... gap 1440min` (a full-day gap) and a
`COUNT_ANOMALY ... phantom-day count 0 vs modal 1`: the day fired zero
times against a modal daily count of one. The count anomaly is the safety
net that catches a vanished day, which a per-firing check would otherwise
report only as one more skipped firing.

## POSIX footer extrapolation: verdicts past the last transition are predictions

A compiled tzdb file (TZif) stores an explicit list of past and near-future
transitions, then a footer: a POSIX TZ string that computes transitions
after the last recorded one. RFC 8536 defines the footer as "a rule for
computing local time changes after the last transition time stored in the
version 2+ data block", and states that "local time for timestamps on or
after the last transition is specified by the TZ string in the footer"
([RFC 8536](https://www.rfc-editor.org/rfc/rfc8536)). cronproof parses that
footer (EVIDENCE.md section 3 records footer-parsing tests for the
Antarctica/Troll and reversed-season Dublin footers).

The consequence is a confidence boundary: a firing before the last
recorded transition rests on data, but a firing after it rests on the
footer extrapolating today's rule forward, which is a prediction, not a
recorded fact. A government can change the rule before that date arrives.
cronproof labels a firing past the last recorded transition ZONE_UNSTABLE
rather than presenting the extrapolated verdict as certain.

## tzdb drift is a correctness dependency

A cronproof verdict is only as current as the tzdb it was computed against.
This repo's runtime tzdb is release 2025b (EVIDENCE.md run metadata and
section 4, "Intl (ICU) tzdb version: 2025b"). The IANA NEWS file already
lists newer releases (2026a, 2026b, 2026c) with real rule changes such as
Alberta going permanent -06
([tz NEWS](https://data.iana.org/time-zones/tzdb/NEWS)). When a runner's
tzdb updates, a schedule proven safe yesterday can silently rest on a stale
proof. The `--tzdb-check <release>` flag turns that silent drift into a
loud exit 3. It attaches to a command, so in CI it reads
`cronproof scan . --tzdb-check 2025b` and for a single expression
`cronproof check "30 2 * * *" --tz Europe/Berlin --from 2025-10-01 --to 2025-11-01 --tzdb-check 2025b`;
on its own the flag is a usage error. EVIDENCE.md section 3 records that "a pin matching the runner
tzdb passes" and "a deliberately wrong pin fails and names both releases".
Pin the release you verified against, and re-verify when you move the pin.
