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
  Walk a repo (or a single file) and report every schedule a supported platform
  understands, each with its file, line, and column and where its timezone came
  from (explicit, inherited from CRON_TZ, a platform default such as UTC, or
  UNKNOWN). Recognized sources: crontab and /etc/crontab (CRON_TZ/TZ
  inheritance), Kubernetes CronJob manifests (Helm templates reported
  UNRESOLVED, never guessed), GitHub Actions `on.schedule.cron`, systemd
  `.timer` units, wrangler.toml, vercel.json, render.yaml, netlify.toml,
  Terraform Cloud Scheduler and EventBridge, and node-cron, cron-parser, Spring
  `@Scheduled`, and Celery beat call sites. Honors `.cronproofignore` and inline
  `cronproof-ignore: <reason>` comments, which must state a reason or they are
  rejected.

Options:

- `--format human|json|sarif|junit|markdown` (default `human`; color only on a TTY)
- `--dialect vixie|debian|quartz|k8s|systemd|github-actions|aws-eventbridge` (default `vixie`)
- `--fail-on info|low|medium|high|critical` (default `high`)
- `--idempotent` treat a double run as harmless, lowering DOUBLED severity
- `--zoneinfo-root <path>` tzdb tree to read; defaults to the copy vendored with
  this package, which matches the runtime's ICU tzdb

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
| 3 | internal verification failure: the two timezone backends disagreed, or the ICU and zoneinfo tzdb versions do not match |

`explain` and `zones` are informational and exit 0 unless an internal
verification failure occurs.

### Receipt and reproducibility

Every output includes a receipt: tool version, tzdb version from both sources
(ICU and the zoneinfo root), ICU version, Node version, the dialect set, the
policy verification statuses, a hash of the inputs, and a hash of the full
result set. The receipt carries no wall-clock timestamp, so two runs on
identical inputs and the same tzdb produce byte-identical json. That
reproducibility is the proof claim.
