/**
 * `cronproof zones`: lists which zones have offset transitions in a
 * window, so an operator can see up front which zones a schedule
 * needs to be checked against.
 */

import { listZones, wallMillisFromFields } from '../../tz/index';
import type { ParsedArgs } from '../args';
import { makeBackend, resolveRoot } from '../analyze';
import type { ResultModel } from '../types';

/** Builds the zones result, or a usage error. */
export function runZones(args: ParsedArgs): { model: ResultModel } | { usageError: string } {
  if (args.hazardWindow === null) {
    return { usageError: 'zones needs --hazard-window FROM..TO (YYYY-MM-DD..YYYY-MM-DD)' };
  }
  const root = resolveRoot(args.zoneinfoRoot);
  const backend = makeBackend(root);
  const startUtc = wallMillisFromFields(args.hazardWindow.from.fields);
  const endUtc = wallMillisFromFields(args.hazardWindow.to.fields);

  const hits: { zone: string; transitions: number }[] = [];
  for (const zone of listZones(root)) {
    const count = backend.transitionsBetween(startUtc, endUtc, zone).length;
    if (count > 0) {
      hits.push({ zone, transitions: count });
    }
  }
  hits.sort((a, b) => (a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0));

  const windowText = `${args.hazardWindow.from.text}..${args.hazardWindow.to.text}`;
  return {
    model: {
      command: 'zones',
      title: `zones with transitions in ${windowText}`,
      inputs: [
        ['command', 'zones'],
        ['hazard-window', windowText],
      ],
      hazards: [],
      sections: [
        {
          heading: `${hits.length} zones with transitions`,
          kind: 'table',
          columns: ['zone', 'transitions'],
          rows: hits.map((hit) => [hit.zone, String(hit.transitions)]),
        },
      ],
      data: { window: windowText, zoneCount: hits.length, zones: hits },
      baseExit: 0,
    },
  };
}
