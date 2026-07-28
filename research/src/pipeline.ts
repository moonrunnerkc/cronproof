/**
 * The pipeline orchestrator. Each of the four stages is independently
 * rerunnable: `collect` touches the network (idempotently), while
 * `filter`, `analyze`, and `report` are pure functions of the cache.
 * With no arguments it runs all four in order; named stages run just
 * those. `--refresh` forces stage 1 to refetch search pages.
 *
 * Usage:
 *   tsx research/src/pipeline.ts                 all stages
 *   tsx research/src/pipeline.ts filter analyze report   from cache
 *   tsx research/src/pipeline.ts collect --refresh       refetch
 */

import { collect } from './stage1-collect';
import { filter } from './stage2-filter';
import { analyze } from './stage3-analyze';
import { report } from './stage4-report';

const STAGES = ['collect', 'filter', 'analyze', 'report'] as const;
type Stage = (typeof STAGES)[number];

function selectedStages(argv: string[]): Stage[] {
  const named = argv.filter((arg): arg is Stage => (STAGES as readonly string[]).includes(arg));
  return named.length === 0 ? [...STAGES] : named;
}

async function runStage(stage: Stage, refresh: boolean): Promise<void> {
  process.stderr.write(`\n== stage: ${stage} ==\n`);
  if (stage === 'collect') {
    await collect(refresh);
  } else if (stage === 'filter') {
    const result = filter();
    process.stderr.write(`[filter] kept ${result.rows.length} of ${result.collected}\n`);
  } else if (stage === 'analyze') {
    analyze();
  } else {
    const { metrics } = report();
    process.stderr.write(
      `[report] headline ${metrics.headline.numerator}/${metrics.headline.denominator}\n`,
    );
  }
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const refresh = argv.includes('--refresh');
  for (const stage of selectedStages(argv)) {
    await runStage(stage, refresh);
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`pipeline failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
