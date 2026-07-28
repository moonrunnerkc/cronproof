/**
 * Public surface of the browser-safe analysis layer: the verdict
 * builder and the pure hazard-view helpers the CLI and the web
 * playground share. Nothing here imports a node builtin.
 */

export { buildVerdict, classifyForVerdict, verdictData } from './verdict';
export type {
  RawVerdict,
  Verdict,
  VerdictDifferential,
  VerdictInput,
  VerdictPolicyColumn,
} from './verdict';
export { hazardToView, hazardMessage, isoUtc, severityOrder } from './hazard-view';
export type { HazardView } from './hazard-view';
