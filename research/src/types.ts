/**
 * Shared types for the corpus study pipeline. Each stage reads the
 * previous stage's artifact and writes its own, so these types are the
 * contract between stages and the schema of the cached files a
 * skeptical reader reconstructs the study from.
 */

/** A single code-search result, before any content or metadata fetch. */
export interface SearchHit {
  /** The query id that surfaced this hit. */
  query: string;
  /** owner/name of the repository. */
  repo: string;
  /** Repo-relative path of the file. */
  path: string;
  /** Git blob sha of the file content at the indexed commit. */
  sha: string;
}

/** Repository metadata used by the exclusion rules. */
export interface RepoMeta {
  /** owner/name. */
  repo: string;
  /** True when GitHub marks the repo a fork. */
  fork: boolean;
  /** Parent repo full name when a fork, else null. */
  parent: string | null;
  /** SPDX license id, or null when unlicensed or unknown. */
  license: string | null;
}

/** A fully collected hit: search result plus content hash and metadata. */
export interface CollectedHit {
  /** The query id that surfaced this hit. */
  query: string;
  /** owner/name. */
  repo: string;
  /** Repo-relative path. */
  path: string;
  /** Git blob sha at the indexed commit. */
  sha: string;
  /** ISO timestamp the content was fetched, recorded once at collection. */
  fetchedAt: string;
  /** SPDX license id or null. */
  license: string | null;
  /** True when the repo is a fork. */
  fork: boolean;
  /** Parent repo full name when a fork, else null. */
  parent: string | null;
  /** sha256 of the decoded file content; the dedup and manifest key. */
  contentHash: string;
}

/** A row of the filtered corpus manifest a reader reconstructs from. */
export interface CorpusRow {
  /** owner/name. */
  repo: string;
  /** Repo-relative path. */
  path: string;
  /** Git blob sha. */
  sha: string;
  /** sha256 of the decoded content. */
  contentHash: string;
  /** The query id that surfaced this row. */
  query: string;
  /** SPDX license id or null. */
  license: string | null;
}

/** A schedule extracted from a corpus file and classified by cronproof. */
export interface AnalyzedSchedule {
  /** owner/name. */
  repo: string;
  /** Repo-relative path. */
  path: string;
  /** Git blob sha. */
  sha: string;
  /** Which platform's schedule this is. */
  sourceKind: string;
  /** The cron dialect governing the expression, or null. */
  dialect: string | null;
  /** Verbatim expression, or null when unresolved. */
  expression: string | null;
  /** Resolved zone when known, else null. */
  zone: string | null;
  /** How the zone was determined (explicit, inherited, platform-default, unknown). */
  zoneSourceKind: string;
  /** True when the expression parsed under its dialect. */
  parsed: boolean;
  /**
   * True when the zone string is a real IANA zone the engine could load.
   * A scanner can extract a malformed value (a quoted zone with a
   * trailing comment, say); such a schedule is not analyzable.
   */
  zoneResolvable: boolean;
  /** Hazard kinds cronproof classified for this schedule in its zone. */
  hazardKinds: string[];
  /** True when at least one firing lands in a transition window in the analysis year. */
  firesInTransitionWindow: boolean;
  /** k8s-cronjob firing count at decision points, or null when not applicable. */
  k8sFiringCount: number | null;
  /** debian-cron firing count at decision points, or null when not applicable. */
  debianFiringCount: number | null;
}
