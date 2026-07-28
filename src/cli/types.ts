/**
 * Shared CLI types. Every command builds a {@link ResultModel}; the
 * formatters turn one model into human, json, sarif, junit, or
 * markdown. Keeping the model format-agnostic is what lets the same
 * analysis render five ways and stay byte-for-byte reproducible in
 * json.
 */

import type { DialectId, LocalFiring } from '../cron/index';
import type { HazardKind, Severity } from '../hazard/index';

/** Output formats the CLI can emit. */
export type Format = 'human' | 'json' | 'sarif' | 'junit' | 'markdown';

/** The four subcommands. */
export type Command = 'check' | 'scan' | 'explain' | 'zones';

/** Exit codes, documented in README and asserted in tests. */
export const EXIT = {
  /** No hazards at or above the fail-on threshold. */
  clean: 0,
  /** Hazards at or above --fail-on were found. */
  hazards: 1,
  /** Usage error or expression parse error. */
  usage: 2,
  /** Internal verification failure: backend disagreement or tzdb mismatch. */
  internal: 3,
} as const;

/** A hazard flattened for rendering, independent of the classifier internals. */
export interface HazardView {
  /** Stable hazard id, used as the SARIF rule id. */
  id: string;
  /** Classification. */
  kind: HazardKind;
  /** Severity. */
  severity: Severity;
  /** IANA zone. */
  zone: string;
  /** Source expression. */
  expression: string;
  /** Intended local time, ISO without offset. */
  localIso: string;
  /** Resolved UTC instants, ISO. */
  instantsUtc: string[];
  /** One-line human message. */
  message: string;
}

/** A renderable section of a result: a table, key/value pairs, or text. */
export type Section =
  | { heading: string; kind: 'text'; lines: string[] }
  | { heading: string; kind: 'keyval'; pairs: [string, string][] }
  | { heading: string; kind: 'table'; columns: string[]; rows: string[][] };

/** The format-agnostic result a command produces. */
export interface ResultModel {
  /** Which command produced this. */
  command: Command;
  /** Human and markdown title. */
  title: string;
  /** Echoed inputs, in stable order; part of the input hash. */
  inputs: [string, string][];
  /** Hazards for sarif, junit, and the human hazard table. */
  hazards: HazardView[];
  /** Ordered display sections for human and markdown. */
  sections: Section[];
  /** Structured payload for json; must be deterministic (no timestamps). */
  data: Record<string, unknown>;
  /** Base exit code from analysis (0 clean, 3 internal failure). */
  baseExit: number;
}

/** The receipt block attached to every output. */
export interface Receipt {
  /** Tool name and version. */
  tool: string;
  toolVersion: string;
  /** tzdb version from ICU (Intl backend). */
  tzdbIntl: string;
  /** tzdb version from the zoneinfo root (TZif backend). */
  tzdbZoneinfo: string;
  /** Zoneinfo root the TZif backend used. */
  zoneinfoRoot: string;
  /** ICU version. */
  icu: string;
  /** Node.js version. */
  node: string;
  /** Dialects this build supports. */
  dialects: DialectId[];
  /** Policy verification statuses, id to VERIFIED/ASSERTED. */
  policies: [string, string][];
  /** Hash of the canonical inputs. */
  inputHash: string;
  /** Hash of the canonical result body. */
  resultHash: string;
}

/** A parsed date argument as naive wall-clock fields plus its source text. */
export interface DateArg {
  /** Original text as given on the command line. */
  text: string;
  /** Parsed wall-clock fields. */
  fields: LocalFiring;
}
