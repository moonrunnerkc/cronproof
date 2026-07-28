/**
 * Builds the receipt block attached to every output: the versions a
 * verdict depends on and the two hashes that make a run auditable and
 * reproducible. The receipt contains no wall-clock timestamp, so two
 * runs on identical inputs and tzdb produce an identical receipt and
 * therefore byte-identical json.
 */

import { ALL_POLICY_IDS, policyVerification } from '../policy/index';
import { tzdbVersions } from '../tz/index';
import type { DialectId } from '../cron/index';
import { hashValue } from './hash';
import type { Receipt, ResultModel } from './types';

/** Dialects this build supports, in a stable order. */
export const SUPPORTED_DIALECTS: DialectId[] = [
  'vixie',
  'debian',
  'quartz',
  'k8s',
  'systemd',
  'github-actions',
  'aws-eventbridge',
];

/** Assembles the receipt for a result model. */
export function buildReceipt(
  model: ResultModel,
  toolVersion: string,
  zoneinfoRoot: string | undefined,
): Receipt {
  const versions = tzdbVersions(zoneinfoRoot);
  return {
    tool: 'cronproof',
    toolVersion,
    tzdbIntl: versions.intlTzdbVersion ?? 'unknown',
    tzdbZoneinfo: versions.zoneinfoTzdbVersion ?? 'unknown',
    zoneinfoRoot: versions.zoneinfoRoot,
    icu: process.versions.icu ?? 'unknown',
    node: process.version,
    dialects: SUPPORTED_DIALECTS,
    policies: ALL_POLICY_IDS.map((id) => [id, policyVerification(id)]),
    inputHash: hashValue(model.inputs),
    resultHash: hashValue({ command: model.command, data: model.data, hazards: model.hazards }),
  };
}

/** The receipt as ordered key/value pairs, for human and markdown. */
export function receiptPairs(receipt: Receipt): [string, string][] {
  return [
    ['tool', `${receipt.tool} ${receipt.toolVersion}`],
    ['node', receipt.node],
    ['icu', receipt.icu],
    ['tzdb (icu)', receipt.tzdbIntl],
    ['tzdb (zoneinfo)', `${receipt.tzdbZoneinfo} (${receipt.zoneinfoRoot})`],
    ['dialects', receipt.dialects.join(', ')],
    ['policies', receipt.policies.map(([id, status]) => `${id}=${status}`).join(', ')],
    ['input hash', receipt.inputHash],
    ['result hash', receipt.resultHash],
  ];
}
