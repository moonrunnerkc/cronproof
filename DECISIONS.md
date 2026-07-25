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
