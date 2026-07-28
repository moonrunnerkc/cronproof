/**
 * `cronproof scan`: file scanning. The parser, dialect detection, and
 * line mapping land in phase 8; this command is recognized now so the
 * CLI surface and the SARIF wiring are stable, and it emits a valid,
 * empty result explaining that.
 */

import type { ParsedArgs } from '../args';
import type { ResultModel } from '../types';

/** Builds the scan placeholder result, or a usage error. */
export function runScan(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.positional === null) {
    return { usageError: 'scan needs a path: cronproof scan <path>' };
  }
  return {
    model: {
      command: 'scan',
      title: `scan ${args.positional}`,
      inputs: [
        ['command', 'scan'],
        ['path', args.positional],
      ],
      hazards: [],
      sections: [
        {
          heading: 'scan',
          kind: 'text',
          lines: ['file scanning is wired in phase 8; no hazards are reported yet'],
        },
      ],
      data: { path: args.positional, note: 'file scanning is wired in phase 8' },
      baseExit: 0,
    },
  };
}
