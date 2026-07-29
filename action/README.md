# cronproof action

A composite GitHub Action that scans a repository for cron schedule timezone and
DST hazards, uploads SARIF so findings appear as code-scanning annotations, and
fails the check per a severity threshold.

## Usage

```yaml
permissions:
  contents: read
  security-events: write # required to upload SARIF

jobs:
  cronproof:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: moonrunnerkc/cronproof/action@main
        with:
          path: "."
          fail-on: high
          baseline: .cronproof-baseline.json # optional
          tzdb-check: 2025b # optional
```

## Inputs

| Input            | Default                | Description                                                              |
| ---------------- | ---------------------- | ------------------------------------------------------------------------ |
| `path`           | `.`                    | Path to scan. Use the repo root so SARIF locations map to files.         |
| `fail-on`        | `high`                 | Minimum severity that fails the check.                                   |
| `baseline`       | (none)                 | Baseline file of accepted hazard ids; those hazards do not fail.         |
| `tzdb-check`     | (none)                 | Pinned tzdb release; the run fails if the runner's tzdb differs.         |
| `idempotent`     | `false`                | Treat double runs as harmless (lowers DOUBLED severity).                 |
| `upload-sarif`   | `true`                 | Upload SARIF to code scanning.                                           |
| `sarif-category` | `cronproof`            | Code-scanning category so parallel runs do not overwrite each other.     |

## Outputs

| Output       | Description                                                        |
| ------------ | ----------------------------------------------------------------- |
| `sarif-file` | Path to the generated SARIF file.                                 |
| `exit-code`  | cronproof exit code: 0 clean, 1 hazards at/above `fail-on`, 3 tzdb drift. |

## Baseline

To adopt cronproof on an existing codebase without its current hazards blocking
every pull request, record them once. cronproof is not on a package registry, so
`npx cronproof` does not resolve: build it from source (see the repository
[README](../README.md#install)), then run the CLI out of `dist/` from the root
of the repository you want to baseline.

```bash
node /path/to/cronproof/dist/cli.js baseline . --out .cronproof-baseline.json
git add .cronproof-baseline.json
```

If you ran `npm link` in the cronproof checkout, `cronproof baseline . --out
.cronproof-baseline.json` is the same command.

Then pass `baseline: .cronproof-baseline.json`. Only hazards introduced after the
baseline was written will fail the check.

## Node version

The action pins the exact Node release in the repository's `.nvmrc`, not the
`22` range. cronproof compares the runtime's ICU tzdb against the zoneinfo tree
vendored in the package and exits 3 when they name different releases, and the
ICU tzdb moves within a Node major, so a range pin would start failing the day
the runner picked up a newer patch.

## tzdb drift

A schedule proven safe under one tzdb release is not necessarily safe under the
next: DST rules change. Pin the release you verified against with `tzdb-check`,
and the run fails when the runner's tzdb has moved so you re-verify deliberately
instead of passing on a stale verdict.
