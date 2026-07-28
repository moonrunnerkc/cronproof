/**
 * JSON output. The object is built in a fixed key order and contains
 * no wall-clock timestamp, so two runs on identical inputs and tzdb
 * serialize to byte-identical text. The receipt (with its two hashes)
 * rides along so a consumer can prove which run produced the result.
 */

import type { Receipt, ResultModel } from './types';

/** Renders a result model and its receipt as deterministic JSON. */
export function formatJson(model: ResultModel, receipt: Receipt): string {
  const object = {
    receipt,
    command: model.command,
    title: model.title,
    inputs: Object.fromEntries(model.inputs),
    hazards: model.hazards,
    data: model.data,
  };
  return `${JSON.stringify(object, null, 2)}\n`;
}
