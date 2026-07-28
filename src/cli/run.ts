/**
 * CLI dispatch: parse argv, run the command, build the receipt, render
 * the chosen format, and return the exit code. Exit codes: 0 clean, 1
 * hazards at or above --fail-on, 2 usage or parse error, 3 internal
 * verification failure. Version reading stays in cli-main so the
 * package.json path is robust for both the source and bundled layouts.
 */

import { parseArgs, type ParsedArgs } from './args';
import { resolveRoot, severityOrder } from './analyze';
import { runCheck } from './commands/check';
import { runExplain } from './commands/explain';
import { runScan } from './commands/scan';
import { runZones } from './commands/zones';
import { formatHuman } from './format-human';
import { formatJson } from './format-json';
import { formatJunit } from './format-junit';
import { formatMarkdown } from './format-markdown';
import { formatSarif } from './format-sarif';
import { buildReceipt } from './receipt';
import { EXIT, type Format, type Receipt, type ResultModel } from './types';

/** Everything the dispatcher needs from the host. */
export interface RunOptions {
  /** Arguments after the node binary and script. */
  argv: string[];
  /** Raw stdout writer. */
  writeOut: (text: string) => void;
  /** Raw stderr writer. */
  writeError: (text: string) => void;
  /** Whether stdout is a TTY (enables color in human output). */
  isTty: boolean;
  /** This package's version, read by the caller. */
  version: string;
}

const HELP = `cronproof <command> [options]

Commands:
  check "<expr>" --tz <zone> --from <date> --to <date>   hazards + policy differential
  explain "<expr>" --tz <zone> --at <instant>            deep dive on one transition
  zones --hazard-window <FROM..TO>                       zones with transitions in a window
  scan <path>                                            find schedules in a repo with file/line/column and zone source

Options:
  --format human|json|sarif|junit|markdown  (default human)
  --dialect vixie|debian|quartz|k8s|systemd|github-actions|aws-eventbridge
  --fail-on info|low|medium|high|critical   (default high)
  --idempotent                              treat double runs as harmless
  --zoneinfo-root <path>                    tzdb tree to read (default: vendored)

Exit codes: 0 clean, 1 hazards at/above --fail-on, 2 usage/parse error, 3 internal failure.
`;

function dispatch(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  switch (args.command) {
    case 'check':
      return runCheck(args);
    case 'explain':
      return runExplain(args);
    case 'zones':
      return runZones(args);
    case 'scan':
      return runScan(args);
  }
}

function render(format: Format, model: ResultModel, receipt: Receipt, tty: boolean): string {
  switch (format) {
    case 'human':
      return formatHuman(model, receipt, tty);
    case 'json':
      return formatJson(model, receipt);
    case 'sarif':
      return formatSarif(model, receipt);
    case 'junit':
      return formatJunit(model, receipt);
    case 'markdown':
      return formatMarkdown(model, receipt);
  }
}

function finalExit(model: ResultModel, args: ParsedArgs): number {
  if (model.baseExit === EXIT.internal) {
    return EXIT.internal;
  }
  // Only the gate commands turn hazards into a non-zero exit; explain
  // and zones are informational deep dives that report but do not fail.
  if (model.command !== 'check' && model.command !== 'scan') {
    return EXIT.clean;
  }
  const threshold = severityOrder(args.failOn);
  const tripped = model.hazards.some((hazard) => severityOrder(hazard.severity) >= threshold);
  return tripped ? EXIT.hazards : EXIT.clean;
}

/** Runs one CLI invocation and returns its exit code. */
export function dispatchCli(options: RunOptions): number {
  const { argv } = options;
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    options.writeOut(HELP);
    return EXIT.clean;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    options.writeOut(`cronproof ${options.version}\n`);
    return EXIT.clean;
  }
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    options.writeError(`cronproof: ${parsed.message}\n`);
    return EXIT.usage;
  }
  let outcome: { model: ResultModel } | { usageError: string };
  let receipt: Receipt;
  try {
    outcome = dispatch(parsed.args);
    if ('usageError' in outcome) {
      options.writeError(`cronproof: ${outcome.usageError}\n`);
      return EXIT.usage;
    }
    const root = resolveRoot(parsed.args.zoneinfoRoot);
    receipt = buildReceipt(outcome.model, options.version, root);
  } catch (error) {
    options.writeError(`cronproof: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT.usage;
  }
  options.writeOut(render(parsed.args.format, outcome.model, receipt, options.isTty));
  return finalExit(outcome.model, parsed.args);
}
