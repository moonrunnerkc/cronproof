# cronproof corpus study

A four-stage, cache-backed pipeline that measures timezone hazards in
public cron schedules on GitHub. It exists to produce the case study, so
it is built to survive a skeptic rerunning it: every stage is
independently rerunnable, the raw responses are cached, and the numbers
are a pure function of that cache.

## Stages

Run all four, or name the ones you want. Only `collect` touches the
network; `filter`, `analyze`, and `report` recompute from the cache.

```
pnpm run research                       # all four stages
pnpm run research report                # re-render from the committed out/, no cache needed
pnpm run research filter analyze report # recompute from a warm cache, no network
pnpm run research collect --refresh     # refetch search pages
```

`cache/` is not committed (see below), so on a fresh clone the only stage
that runs without `collect` is `report`, which reads the committed
`out/analysis.jsonl`. `filter` and `analyze` stop with an error naming the
missing cache rather than writing an empty corpus over the published one;
`collect` needs a GitHub token to rebuild the cache.

1. **collect** (`stage1-collect.ts`). Runs four GitHub code-search
   queries (Kubernetes CronJobs with a `timeZone`, `wrangler.toml` and
   `vercel.json` crons, and `CRON_TZ` crontabs), pages through the
   results, and caches each raw search page, each file's content (keyed
   by its git blob sha), and each repository's metadata. Backs off on
   rate limits. Idempotent: a warm cache means zero network calls.
   Output: `cache/hits.jsonl`.
2. **filter** (`stage2-filter.ts`). Excludes vendored copies, cron
   libraries and test fixtures, and forks, then dedupes by content hash.
   Rules run in a fixed order so each exclusion is charged to exactly
   one rule. Output: `out/corpus.jsonl` (the published manifest) and
   `out/exclusions.json` (the count removed by each rule).
3. **analyze** (`stage3-analyze.ts`). Runs the real cronproof scanner
   and classifier over every corpus file, over a pinned 12-month window,
   and runs the k8s-cronjob against debian-cron policy differential.
   Output: `out/analysis.jsonl`.
4. **report** (`stage4-report.ts`). Computes every metric with its
   denominator visible and renders `out/report.md` and `out/metrics.json`.

## What is published, what is cached

- Published (committed): `out/` holds the corpus manifest, the exclusion
  counts, the per-schedule analysis, the metrics, and the report. The
  manifest gives repo, path, sha, and content hash for every kept file,
  which is enough to reconstruct the exact corpus.
- Cached (not committed): `cache/` holds raw GitHub responses and file
  contents. It is reconstructible from the manifest by rerunning
  `collect`, so it is left out of version control (it also holds
  third-party file contents under their own licenses).

## Reproducibility

`filter`, `analyze`, and `report` are deterministic functions of the
cache. The analysis window is pinned (not "now") for exactly this
reason. Two runs from the same cache produce byte-identical `report.md`
and `metrics.json`.

## Limitations

Stated in full at the end of `out/report.md`. In short: GitHub code
search is not a uniform sample of production schedules, a public
schedule is not proof of production use, and every number is computed
over this one corpus and must not be generalized past it.
