/**
 * `cronproof baseline <path> [--out <file>]`: scan a tree, classify its
 * hazards, and write their ids to a baseline file. Those hazards are
 * then accepted by `cronproof scan --baseline <file>`, so an existing
 * codebase adopts the gate without its current hazards blocking every
 * build; only hazards introduced after the baseline was written fail.
 */

import { analyzeScan } from '../scan-run';
import { writeBaseline } from '../baseline';
import type { ParsedArgs } from '../args';
import type { ResultModel } from '../types';

const DEFAULT_OUT = '.cronproof-baseline.json';

/** Builds the baseline result (writing the file), or a usage error. */
export function runBaseline(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null) {
    return { usageError: 'baseline needs a path: cronproof baseline <path> --out <file>' };
  }
  const out = args.out ?? DEFAULT_OUT;
  let analysis: ReturnType<typeof analyzeScan>;
  try {
    analysis = analyzeScan(args.positional, args);
  } catch (error) {
    return { usageError: `cannot scan ${args.positional}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const ids = analysis.hazards.map((hazard) => hazard.id);
  let written: number;
  try {
    written = writeBaseline(out, ids);
  } catch (error) {
    return { usageError: `cannot write baseline ${out}: ${error instanceof Error ? error.message : String(error)}` };
  }

  return {
    model: {
      command: 'baseline',
      title: `baseline ${args.positional}`,
      inputs: [
        ['command', 'baseline'],
        ['path', args.positional],
        ['out', out],
      ],
      hazards: [],
      sections: [
        {
          heading: 'baseline written',
          kind: 'keyval',
          pairs: [
            ['file', out],
            ['hazards accepted', String(written)],
            ['schedules scanned', String(analysis.result.findings.length)],
          ],
        },
      ],
      data: {
        out,
        accepted: written,
        ids: [...new Set(ids)].sort(),
      },
      baseExit: 0,
    },
  };
}
