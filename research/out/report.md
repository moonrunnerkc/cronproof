# cronproof corpus study: timezone hazards in public cron schedules

## Method

GitHub code search, four platform queries, up to 3 pages of 100 per query:

- `k8s-cronjob`: `timeZone schedule kind CronJob language:YAML`
- `wrangler`: `crons filename:wrangler.toml`
- `vercel`: `crons filename:vercel.json`
- `crontab`: `CRON_TZ filename:crontab`

Every hit's raw response, file content, and repository metadata are cached, so stages 2 to 4 recompute from the cache with no network and reproduce byte-identical numbers. The analysis window is fixed at 2025-01-01 to 2026-01-01 (UTC wall-clock).

## Corpus construction

Collected hits (raw, after per-query dedup): **1055**. Kept after exclusions: **965**.

| exclusion rule | excluded | what it removes |
| --- | --- | --- |
| vendored | 0 | file sits under a vendored dependency directory (vendor, node_modules, third_party, and similar) |
| library-or-fixture | 23 | file is a cron-library repository or lives in a test-fixture directory (testdata, fixtures, golden) |
| fork | 0 | repository is a fork, so its schedule is almost always a copy of an upstream already counted |
| duplicate | 67 | identical file content (same sha256) as a row already kept |

## Schedules extracted

Total schedules extracted from the corpus: **1418**. Analyzable (expression parsed and a concrete, loadable zone): **1175**. Zone not knowable from source: **185**. Concrete zone but expression did not parse: **57**. Concrete but non-loadable zone string: **1**.

| source platform | schedules |
| --- | --- |
| vercel | 572 |
| crontab | 361 |
| k8s-cronjob | 243 |
| wrangler | 242 |

## Headline: Kubernetes CronJob portability defect rate

Of public Kubernetes CronJobs with an explicit non-UTC `timeZone` whose expression parsed, the fraction that would fire a different number of times under the Kubernetes controller than under debian-cron for the same expression and zone, over 2025-01-01 to 2026-01-01 (UTC wall-clock):

> **4/92 (4.3%)**

The denominator is every qualifying CronJob; the numerator is those whose k8s-cronjob and debian-cron firing counts differ at the transition decision points. A difference means a job ported between the two schedulers would run a different number of times across a DST change.

Across all analyzable k8s CronJobs regardless of zone (UTC included, where the two always agree): **4/112 (3.6%)**.

## Secondary: firings inside a transition window

Of analyzable schedules, the fraction with at least one firing inside a transition window over 2025-01-01 to 2026-01-01 (UTC wall-clock):

> **24/1175 (2.0%)**

### Distribution across hazard classes

Analyzable schedules carrying each hazard kind (a schedule can carry more than one), out of 1175 analyzable:

| hazard class | schedules |
| --- | --- |
| SKIPPED | 13 |
| DOUBLED | 12 |
| INTERVAL_DRIFT | 9 |
| COUNT_ANOMALY | 0 |
| ZONE_UNSTABLE | 0 |

### Top zones by hazard count

| zone | schedules with a hazard |
| --- | --- |
| America/New_York | 7 |
| America/Chicago | 3 |
| Europe/Berlin | 3 |
| Europe/Rome | 3 |
| America/Toronto | 2 |
| Europe/Paris | 2 |
| Europe/Tallinn | 2 |
| Europe/Amsterdam | 1 |
| Europe/London | 1 |

## Reproducibility and credentials

Which stages need credentials, stated exactly:

- **Stage 1, collect** needs the network and a GitHub token (read through the gh CLI) for the code-search rate limit. It cannot run without one.
- **Stages 2 to 4, filter, analyze, and report** need no credentials and no network. They are pure functions of the cache, and two runs from the same cache produce byte-identical out/ (verified: the report and metrics sha256 are unchanged across a second run).

The reproducibility claim is scoped accordingly. A third party cannot rerun collect against the exact same GitHub index (code search is not stable over time), but they can reconstruct this exact corpus from the published manifest, out/corpus.jsonl, which lists repo, path, git blob sha, and sha256 for every kept file. Each file's content is fetchable from its public repository by blob sha through the unauthenticated GitHub git blobs API (no token, only a lower rate limit), and each fetched file's sha256 must equal the recorded content hash. With the reconstructed cache, filter, analyze, and report reproduce these numbers. The published out/analysis.jsonl additionally lets report be re-run with no network at all, so the numbers below can be rechecked offline from published data.

## Sampling limitations

- GitHub code search is not a uniform sample of production schedules. It indexes public default branches, ranks by relevance, and exposes at most 1000 results per query; this study takes only the first 3 pages. The corpus is an opportunistic snapshot, not a census.
- A schedule in a public repository is not evidence it runs in production, at that cadence, or in the declared zone.
- The exclusion rules reduce but cannot eliminate near-duplicates (a lightly edited copy has a different content hash and survives dedup).
- Every number here is computed over this exact corpus. Do not generalize past it. The corpus manifest (out/corpus.jsonl: repo, path, sha, content hash) is published so the set can be reconstructed and the numbers rechecked.
