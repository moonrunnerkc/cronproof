/**
 * Stage 4, report. Reads the analysis and the exclusion tally and
 * renders both a machine-readable metrics.json and a human report.md.
 * Every rate is printed as numerator over denominator with the percent
 * in parentheses, so no fraction hides its base. The output is a pure
 * function of the stage 2 and stage 3 artifacts, so a rerun from cache
 * reproduces it byte for byte.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_PAGES, OUT_DIR, PER_PAGE, QUERIES, WINDOW_LABEL } from './config';
import { readJson, readJsonl, writeJson } from './cache';
import { ANALYSIS_FILE } from './stage3-analyze';
import { EXCLUSIONS_FILE } from './stage2-filter';
import { computeMetrics, type Metrics, type Rate } from './metrics';
import type { AnalyzedSchedule } from './types';

/** Path of the rendered human report. */
export const REPORT_FILE = path.join(OUT_DIR, 'report.md');

/** Path of the machine-readable metrics. */
export const METRICS_FILE = path.join(OUT_DIR, 'metrics.json');

interface ExclusionsFile {
  collected: number;
  kept: number;
  excluded: { rule: string; description: string; count: number }[];
}

function pct(rate: Rate): string {
  if (rate.denominator === 0) {
    return `${rate.numerator}/${rate.denominator} (no data)`;
  }
  const value = ((rate.numerator / rate.denominator) * 100).toFixed(1);
  return `${rate.numerator}/${rate.denominator} (${value}%)`;
}

function table(header: string[], rows: string[][]): string {
  const head = `| ${header.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

function methodSection(): string {
  const queries = QUERIES.map((q) => `- \`${q.id}\`: \`${q.q}\``).join('\n');
  return (
    `## Method\n\n` +
    `GitHub code search, four platform queries, up to ${MAX_PAGES} pages of ${PER_PAGE} per query:\n\n` +
    `${queries}\n\n` +
    `Every hit's raw response, file content, and repository metadata are cached, so stages 2 to 4 ` +
    `recompute from the cache with no network and reproduce byte-identical numbers. The analysis ` +
    `window is fixed at ${WINDOW_LABEL}.\n`
  );
}

function corpusSection(exclusions: ExclusionsFile): string {
  const rows = exclusions.excluded.map((rule) => [rule.rule, String(rule.count), rule.description]);
  return (
    `## Corpus construction\n\n` +
    `Collected hits (raw, after per-query dedup): **${exclusions.collected}**. ` +
    `Kept after exclusions: **${exclusions.kept}**.\n\n` +
    `${table(['exclusion rule', 'excluded', 'what it removes'], rows)}\n`
  );
}

function scheduleSection(metrics: Metrics): string {
  const bySource = metrics.bySource.map((row) => [row.sourceKind, String(row.count)]);
  return (
    `## Schedules extracted\n\n` +
    `Total schedules extracted from the ${metrics.extracted === 0 ? 0 : ''}corpus: **${metrics.extracted}**. ` +
    `Analyzable (expression parsed and a concrete, loadable zone): **${metrics.analyzable}**. ` +
    `Zone not knowable from source: **${metrics.unknownZone}**. ` +
    `Concrete zone but expression did not parse: **${metrics.unparsed}**. ` +
    `Concrete but non-loadable zone string: **${metrics.invalidZone}**.\n\n` +
    `${table(['source platform', 'schedules'], bySource)}\n`
  );
}

function headlineSection(metrics: Metrics): string {
  return (
    `## Headline: Kubernetes CronJob portability defect rate\n\n` +
    `Of public Kubernetes CronJobs with an explicit non-UTC \`timeZone\` whose expression parsed, ` +
    `the fraction that would fire a different number of times under the Kubernetes controller than ` +
    `under debian-cron for the same expression and zone, over ${WINDOW_LABEL}:\n\n` +
    `> **${pct(metrics.headline)}**\n\n` +
    `The denominator is every qualifying CronJob; the numerator is those whose k8s-cronjob and ` +
    `debian-cron firing counts differ at the transition decision points. A difference means a job ` +
    `ported between the two schedulers would run a different number of times across a DST change.\n\n` +
    `Across all analyzable k8s CronJobs regardless of zone (UTC included, where the two always agree): ` +
    `**${pct(metrics.k8sVsDebianAllZones)}**.\n`
  );
}

function secondarySection(metrics: Metrics): string {
  const dist = metrics.hazardDistribution.map((row) => [row.kind, String(row.count)]);
  const zones = metrics.topZones.map((row) => [row.zone, String(row.hazardSchedules)]);
  const zoneTable =
    metrics.topZones.length === 0
      ? '_No zones had a hazard in this corpus._'
      : table(['zone', 'schedules with a hazard'], zones);
  return (
    `## Secondary: firings inside a transition window\n\n` +
    `Of analyzable schedules, the fraction with at least one firing inside a transition window ` +
    `over ${WINDOW_LABEL}:\n\n` +
    `> **${pct(metrics.transitionWindow)}**\n\n` +
    `### Distribution across hazard classes\n\n` +
    `Analyzable schedules carrying each hazard kind (a schedule can carry more than one), out of ` +
    `${metrics.analyzable} analyzable:\n\n` +
    `${table(['hazard class', 'schedules'], dist)}\n\n` +
    `### Top zones by hazard count\n\n${zoneTable}\n`
  );
}

function limitationsSection(): string {
  return (
    `## Sampling limitations\n\n` +
    `- GitHub code search is not a uniform sample of production schedules. It indexes public ` +
    `default branches, ranks by relevance, and exposes at most 1000 results per query; this study ` +
    `takes only the first ${MAX_PAGES} pages. The corpus is an opportunistic snapshot, not a census.\n` +
    `- A schedule in a public repository is not evidence it runs in production, at that cadence, or ` +
    `in the declared zone.\n` +
    `- The exclusion rules reduce but cannot eliminate near-duplicates (a lightly edited copy has a ` +
    `different content hash and survives dedup).\n` +
    `- Every number here is computed over this exact corpus. Do not generalize past it. The corpus ` +
    `manifest (out/corpus.jsonl: repo, path, sha, content hash) is published so the set can be ` +
    `reconstructed and the numbers rechecked.\n`
  );
}

function reproducibilitySection(): string {
  return (
    `## Reproducibility and credentials\n\n` +
    `Which stages need credentials, stated exactly:\n\n` +
    `- **Stage 1, collect** needs the network and a GitHub token (read through ` +
    `the gh CLI) for the code-search rate limit. It cannot run without one.\n` +
    `- **Stages 2 to 4, filter, analyze, and report** need no credentials and ` +
    `no network. They are pure functions of the cache, and two runs from the ` +
    `same cache produce byte-identical out/ (verified: the report and metrics ` +
    `sha256 are unchanged across a second run).\n\n` +
    `The reproducibility claim is scoped accordingly. A third party cannot ` +
    `rerun collect against the exact same GitHub index (code search is not ` +
    `stable over time), but they can reconstruct this exact corpus from the ` +
    `published manifest, out/corpus.jsonl, which lists repo, path, git blob ` +
    `sha, and sha256 for every kept file. Each file's content is fetchable ` +
    `from its public repository by blob sha through the unauthenticated GitHub ` +
    `git blobs API (no token, only a lower rate limit), and each fetched ` +
    `file's sha256 must equal the recorded content hash. With the reconstructed ` +
    `cache, filter, analyze, and report reproduce these numbers. The published ` +
    `out/analysis.jsonl additionally lets report be re-run with no network at ` +
    `all, so the numbers below can be rechecked offline from published data.\n`
  );
}

function render(metrics: Metrics, exclusions: ExclusionsFile): string {
  return [
    `# cronproof corpus study: timezone hazards in public cron schedules\n`,
    methodSection(),
    corpusSection(exclusions),
    scheduleSection(metrics),
    headlineSection(metrics),
    secondarySection(metrics),
    reproducibilitySection(),
    limitationsSection(),
  ].join('\n');
}

/** Computes the metrics, writes metrics.json and report.md, returns both. */
export function report(): { metrics: Metrics; document: string } {
  const schedules = readJsonl<AnalyzedSchedule>(ANALYSIS_FILE);
  const exclusions = readJson<ExclusionsFile>(EXCLUSIONS_FILE) ?? {
    collected: 0,
    kept: 0,
    excluded: [],
  };
  const metrics = computeMetrics(schedules);
  const document = render(metrics, exclusions);
  writeJson(METRICS_FILE, metrics);
  mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  writeFileSync(REPORT_FILE, document, 'utf8');
  return { metrics, document };
}
