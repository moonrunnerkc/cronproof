# cronproof

A pre-execution differential prover for cron schedule hazards across timezone offset transitions.

[![CI](https://github.com/moonrunnerkc/cronproof/actions/workflows/ci.yml/badge.svg)](https://github.com/moonrunnerkc/cronproof/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](./package.json)

## What This Does

cronproof takes a cron expression, an IANA zone, and a window, and reports every wall-clock firing that a daylight-saving transition skips, doubles, or drifts. Instead of picking one scheduler and answering "it fires here", it evaluates the schedule under ten explicit scheduler policy models and reports where they disagree, because a disagreement is a portability defect waiting to happen when a job moves between platforms. It runs as a CLI and as a CI gate that emits SARIF, and every scheduler model is tagged VERIFIED (confirmed against a real run with a committed fixture) or ASSERTED, so a claim is never presented as more certain than it is.

## Install

cronproof is not published to a package registry; install it from source.

```bash
git clone https://github.com/moonrunnerkc/cronproof
cd cronproof
pnpm install
pnpm build
npm link           # optional: puts `cronproof` on PATH; or run `node dist/cli.js`
```

For CI, use the published composite GitHub Action instead (see [CI setup](#ci-setup)); it needs no local install.

## Quick example

A daily 02:30 job in Berlin, across the October fall-back. The 02:30 wall time occurs twice, so a naive scheduler and the Kubernetes controller fire it twice while Debian cron fires it once. That disagreement is the finding:

```console
$ cronproof check "30 2 * * *" --tz Europe/Berlin --from 2025-10-01 --to 2025-11-01
check 30 2 * * * [vixie] in Europe/Berlin

hazards
  severity  kind     local time        instants (UTC)                                      id
  --------  -------  ----------------  --------------------------------------------------  -------------------
  critical  DOUBLED  2025-10-26 02:30  2025-10-26T00:30:00.000Z, 2025-10-26T01:30:00.000Z  hz_9afc78ca19803859

policy differential (fire count per decision point)
  decision point  naive  debian-cron  cronie  k8s-cronjob  quartz  croniter  cronsim  cron-parser-luxon  node-cron  systemd-timer
  --------------  -----  -----------  ------  -----------  ------  --------  -------  -----------------  ---------  -------------
  2:30 ambiguous  2      1            1       2            ?       2         1        1                  1          1

portability verdict
  verdict                 disagreement
  safe to port            false
  definite disagreements  naive vs debian-cron; ...; debian-cron vs k8s-cronjob; debian-cron vs croniter; ...
```

`quartz` shows `?` because its DST behavior is ASSERTED and its gap and fold branches are UNDEFINED, never guessed. The output also carries a receipt (tool and tzdb versions, input and result hashes) that makes two runs on identical inputs and tzdb byte-for-byte identical.

## Commands

- `cronproof check "<expr>" --tz <zone> --from <date> --to <date>` timezone hazard table plus the scheduler disagreement matrix for one expression.
- `cronproof explain "<expr>" --tz <zone> --at <instant>` a deep dive on one transition, formatted to paste into a bug report.
- `cronproof zones --hazard-window <FROM..TO>` which zones have offset transitions in a window.
- `cronproof scan <path>` walk a repo (or a file), report every schedule a supported platform understands with its file, line, and column and where its timezone came from (explicit, inherited from CRON_TZ, a platform default such as UTC, or UNKNOWN), classify each one's hazards over a window, and exit non-zero on hazards at or above `--fail-on`. Recognized sources: crontab and /etc/crontab, Kubernetes CronJob manifests (Helm templates reported UNRESOLVED, never guessed), GitHub Actions `on.schedule.cron`, systemd `.timer` units, wrangler.toml, vercel.json, render.yaml, netlify.toml, Terraform Cloud Scheduler and EventBridge, and node-cron, cron-parser, Spring `@Scheduled`, and Celery beat call sites. Honors `.cronproofignore` and inline `cronproof-ignore: <reason>` comments.
- `cronproof baseline <path> --out <file>` write the current hazard ids to a baseline so an existing codebase can adopt the gate without its known hazards blocking every build.

Options: `--format human|json|sarif|junit|markdown`, `--dialect vixie|debian|quartz|k8s|systemd|github-actions|aws-eventbridge`, `--fail-on info|low|medium|high|critical`, `--idempotent`, `--baseline <file>`, `--tzdb-check <release>`, `--zoneinfo-root <path>`.

## Exit codes

| code | meaning |
| ---- | ------- |
| 0 | clean: no hazards at or above `--fail-on` |
| 1 | hazards at or above `--fail-on` were found (gate commands `check` and `scan`) |
| 2 | usage error or expression parse error |
| 3 | internal failure: the two timezone backends disagreed, the ICU and zoneinfo tzdb versions do not match, or `--tzdb-check` found the runner's tzdb differs from the pin |

`explain` and `zones` are informational and exit 0 unless an internal verification failure occurs.

## CI setup

The `action/` directory publishes a composite GitHub Action that scans a repo, uploads SARIF so hazards appear as code-scanning annotations, and fails the check per `--fail-on`:

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

`--tzdb-check <release>` guards against tzdb drift: a schedule proven safe under one tzdb release is not necessarily safe under the next, because time-zone rules are political and change between releases. It fails with exit 3 if the runner's tzdb differs from the pin, turning a silent stale pass into a deliberate re-verification. See [action/README.md](action/README.md) and [docs/dst-semantics.md](docs/dst-semantics.md).

## Dialect and policy support

Seven cron dialects parse: `vixie`, `debian`, `quartz`, `k8s`, `systemd`, `github-actions`, `aws-eventbridge`.

Ten scheduler policy models, with the verification status and fixture the CLI reports in its receipt. Statuses and fixtures below are reproduced from the differential table in [EVIDENCE.md](EVIDENCE.md); the per-model behavior and its source are documented in [docs/policy-models.md](docs/policy-models.md).

| policy | status | verifying fixture |
| ------ | ------ | ----------------- |
| naive | ASSERTED | definitional straw model; no real scheduler to run |
| debian-cron | VERIFIED | debian-cron.json: cron 3.0pl1 under libfaketime |
| cronie | VERIFIED | cronie.json: cronie 1.7.2 on Fedora under libfaketime |
| k8s-cronjob | VERIFIED | k8s-cronjob.json: robfig/cron v3 Next() sequence |
| quartz | ASSERTED | not run (needs a JVM); DST gap and fold UNDEFINED |
| croniter | VERIFIED | croniter.json: croniter 6.2.4 sequence |
| cronsim | VERIFIED | cronsim.json: cronsim 2.7 sequence |
| cron-parser-luxon | VERIFIED | cron-parser-luxon.json: cron-parser 4.9.0 |
| node-cron | VERIFIED | node-cron.json: node-cron 3.0.3 under a virtual clock |
| systemd-timer | VERIFIED | systemd-timer.json: systemd-analyze calendar 249 |

## Positioning

Good tools already exist in this space, and cronproof is not a replacement for any of them. It is a different category.

- [cronsim](https://github.com/cuu508/cronsim) deliberately emulates Debian's cron: its own README states that if it evaluates an expression differently from Debian's cron, "that's a bug". It is the right choice when you want one specific, faithful answer for Debian cron.
- [cron-parser](https://github.com/harrisiirak/cron-parser) and [Cronos](https://github.com/HangfireIO/Cronos) each apply their own DST policy. cron-parser resolves times through Luxon; Cronos documents a Vixie-derived policy that shifts a skipped time forward to the next valid time and fires a folded non-interval job once. Each is internally consistent and correct for its own rule.
- [crontab.guru](https://crontab.guru/) is an excellent cron expression editor and has no timezone or daylight-saving handling at all, by design.
- [Cronitor](https://cronitor.io/cron-job-monitoring) and [Healthchecks](https://healthchecks.io/docs/) monitor a job and alert when a run is missed, fails, or never starts. That detection happens after the run was due: Healthchecks is "a dead man's switch" that alerts when a ping "does not arrive on time".

Each of those answers a real question well. cronproof answers a different one, before execution: not "when does this fire under scheduler X" but "what would every scheduler do, and where do they disagree". A single-scheduler answer is correct for that scheduler and silent about the fact that another scheduler on the same expression and zone would fire a different number of times. cronproof makes that disagreement the finding, and it never picks one scheduler and presents its answer as the answer. The distinction is category, not quality.

## Documentation

- [docs/dst-semantics.md](docs/dst-semantics.md): the wall-clock resolution cases, sub-hour and multi-hour transitions, abolished DST, missing calendar days, POSIX footer extrapolation, and tzdb drift.
- [docs/policy-models.md](docs/policy-models.md): each scheduler model, its source, its verification status, and its fixture.
- [EVIDENCE.md](EVIDENCE.md): regenerated from real command output by `npm run evidence`.
- [research/out/report.md](research/out/report.md): the corpus study over public GitHub schedules.

## License

[MIT](./LICENSE).
