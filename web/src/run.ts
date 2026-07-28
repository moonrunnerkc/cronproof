/**
 * The browser analysis step, kept pure and DOM-free so it is unit
 * testable and so the parity test can drive the exact code the page
 * runs. It parses the expression, converts the date bounds, and calls
 * the shared verdict builder with the injected backend. In the browser
 * that backend is Intl and no zoneinfo root is passed, which is what
 * single-backend mode means: no ZONE_UNSTABLE detection.
 */

import { classifyForVerdict, verdictData, type Verdict } from '../../src/analyze/index';
import { parse } from '../../src/cron/index';
import type { Hazard } from '../../src/hazard/index';
import type { TzBackend } from '../../src/tz/types';
import { parseDateString, type PlaygroundState } from './state';

/** The outcome of a browser analysis: an error, or hazards and a verdict. */
export type WebResult =
  | { ok: false; error: string }
  | { ok: true; hazards: Hazard[]; verdict: Verdict };

/**
 * Analyzes one playground state against a backend. Returns a usage-style
 * error string when the expression does not parse or a date bound is
 * malformed, otherwise the classified hazards and the verdict payload
 * (identical in shape to the CLI's `check` data).
 */
export function runAnalysis(state: PlaygroundState, backend: TzBackend): WebResult {
  const parsed = parse(state.expression, state.dialect);
  if (!parsed.ok) {
    const first = parsed.errors[0];
    return {
      ok: false,
      error: `parse error at offset ${first?.offset ?? 0}: ${first?.reason ?? 'invalid expression'}`,
    };
  }
  const from = parseDateString(state.from);
  const to = parseDateString(state.to);
  if (from === null) {
    return { ok: false, error: `from "${state.from}" is not a YYYY-MM-DD or YYYY-MM-DDTHH:MM date` };
  }
  if (to === null) {
    return { ok: false, error: `to "${state.to}" is not a YYYY-MM-DD or YYYY-MM-DDTHH:MM date` };
  }

  let raw;
  try {
    raw = classifyForVerdict(parsed.ast, backend, {
      expression: state.expression,
      dialect: state.dialect,
      zone: state.zone,
      from,
      to,
      idempotent: state.idempotent,
    });
  } catch (error) {
    return { ok: false, error: `cannot analyze: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, hazards: raw.hazards, verdict: verdictData(raw.hazards, raw.report) };
}
