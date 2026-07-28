# cronproof

A differential prover for cron schedule hazards across timezone offset
transitions. cronproof does not answer "when does this schedule fire?" with a
single number. It evaluates a schedule under multiple explicit scheduler policy
models and reports where they disagree, and it flags the wall-clock times a
daylight-saving transition skips, doubles, or drifts. A disagreement is the
finding: it marks a firing that is skipped, doubled, or ambiguous under at
least one real scheduler policy.

Every scheduler policy model is tagged VERIFIED (phase 6 ran the real scheduler
and confirmed it) or ASSERTED (it came from documentation or, for the naive
straw model, by definition). The CLI prints the verification status of every
policy it used. ASSERTED is never presented as fact.

## CLI

```
cronproof <command> [options]
```

Commands:

- `cronproof check "<expr>" --tz <zone> --from <date> --to <date>`
  Timezone hazard table plus the scheduler policy disagreement matrix for one
  expression.
- `cronproof explain "<expr>" --tz <zone> --at <instant>`
  A deep dive on one transition: the gap or fold, the intended local time, and
  what each policy does, formatted to paste into a bug report.
- `cronproof zones --hazard-window <FROM..TO>`
  Which zones have offset transitions in a window.
- `cronproof scan <path>`
  Walk a repo (or a single file), report every schedule a supported platform
  understands with its file, line, and column and where its timezone came from
  (explicit, inherited from CRON_TZ, a platform default such as UTC, or UNKNOWN),
  and classify each one's timezone hazards over a window so the result is a CI
  gate: it exits 1 on hazards at or above `--fail-on` and emits SARIF anchored to
  the source line. Recognized sources: crontab and /etc/crontab (CRON_TZ/TZ
  inheritance), Kubernetes CronJob manifests (Helm templates reported
  UNRESOLVED, never guessed), GitHub Actions `on.schedule.cron`, systemd
  `.timer` units, wrangler.toml, vercel.json, render.yaml, netlify.toml,
  Terraform Cloud Scheduler and EventBridge, and node-cron, cron-parser, Spring
  `@Scheduled`, and Celery beat call sites. Honors `.cronproofignore` and inline
  `cronproof-ignore: <reason>` comments, which must state a reason or they are
  rejected.
- `cronproof baseline <path> --out <file>`
  Scan a tree and write its current hazard ids to a baseline file, so an existing
  codebase can adopt the gate without its known hazards blocking every build.

Options:

- `--format human|json|sarif|junit|markdown` (default `human`; color only on a TTY)
- `--dialect vixie|debian|quartz|k8s|systemd|github-actions|aws-eventbridge` (default `vixie`)
- `--fail-on info|low|medium|high|critical` (default `high`)
- `--idempotent` treat a double run as harmless, lowering DOUBLED severity
- `--baseline <file>` accept the hazards listed in a baseline file (scan)
- `--tzdb-check <release>` fail if the runner's tzdb differs from this pin
- `--zoneinfo-root <path>` tzdb tree to read; defaults to the copy vendored with
  this package, which matches the runtime's ICU tzdb

### CI gate and GitHub Action

The `action/` directory publishes a composite GitHub Action that scans a repo,
uploads SARIF so hazards appear as code-scanning annotations, and fails the
check per `--fail-on`:

```yaml
permissions:
  contents: read
  security-events: write
steps:
  - uses: actions/checkout@v4
  - uses: moonrunnerkc/cronproof/action@main
    with:
      path: "."
      fail-on: high
      baseline: .cronproof-baseline.json # optional
      tzdb-check: 2025b # optional
```

See [action/README.md](action/README.md) for all inputs and outputs.

### Baseline

An existing codebase usually has hazards on day one, and a gate that fails on
all of them is a gate nobody turns on. `cronproof baseline <path> --out <file>`
records the current hazard ids so they are accepted, and `scan --baseline <file>`
then fails only on hazards introduced after the baseline was written:

```bash
cronproof baseline . --out .cronproof-baseline.json
git add .cronproof-baseline.json
cronproof scan . --baseline .cronproof-baseline.json --fail-on high
```

Hazard ids are stable across runs and refactors (they hash the schedule's
meaning, not its line), so a baseline stays valid until the schedule itself
changes.

### tzdb drift

A schedule proven safe under one tzdb release is not necessarily safe under the
next. Time-zone rules are political: a government can move a DST boundary or
abolish DST between tzdata releases, and a firing that was fine (`02:30` on a
night with no transition) becomes skipped or doubled the next year. cronproof's
verdict is only as current as the tzdb it was computed against, so a CI run that
passes today can silently rest on a stale proof after the runner's tzdb updates.

`--tzdb-check <release>` guards against this. It compares the runner's ICU tzdb
against the release you verified with and fails with exit 3 on any difference,
turning a silent stale pass into a loud, deliberate re-verification:

```bash
cronproof scan . --tzdb-check 2025b
# exit 3 with a drift message if the runner's tzdb is not 2025b
```

Pin the release you tested against, and update the pin only after re-running the
scan against the new tzdb and confirming the verdicts still hold. The weekly
`scheduled-scan` workflow in this repo does exactly that on a cron.

### SARIF

`--format sarif` emits a SARIF 2.1.0 log so hazards appear as GitHub code
scanning annotations. Hazard severity maps to the SARIF level (critical and
high to `error`, medium to `warning`, low and info to `note`), and the stable
hazard id is the SARIF rule id, so a specific hazard can be suppressed by id
through the standard mechanism.

### Exit codes

| code | meaning |
| ---- | ------- |
| 0 | clean: no hazards at or above `--fail-on` |
| 1 | hazards at or above `--fail-on` were found (gate commands `check` and `scan`) |
| 2 | usage error or expression parse error |
| 3 | internal failure: the two timezone backends disagreed, the ICU and zoneinfo tzdb versions do not match, or `--tzdb-check` found the runner's tzdb differs from the pin |

`explain` and `zones` are informational and exit 0 unless an internal
verification failure occurs.

### Receipt and reproducibility

Every output includes a receipt: tool version, tzdb version from both sources
(ICU and the zoneinfo root), ICU version, Node version, the dialect set, the
policy verification statuses, a hash of the inputs, and a hash of the full
result set. The receipt carries no wall-clock timestamp, so two runs on
identical inputs and the same tzdb produce byte-identical json. That
reproducibility is the proof claim.
