/**
 * Shared types for the repository scanner. A scan walks a source tree,
 * finds every schedule declaration a supported platform understands,
 * and records where it lives (file, line, column) so a finding maps
 * back to the exact byte in source.
 *
 * The zone source is a first-class part of every finding: a schedule
 * whose timezone cannot be determined cannot be proven safe, so an
 * unknown zone is itself a reportable finding, not a silent default.
 */

import type { DialectId } from '../cron/index';

/** Every schedule source this scanner recognizes. */
export type SourceKind =
  | 'crontab'
  | 'k8s-cronjob'
  | 'github-actions'
  | 'systemd-timer'
  | 'wrangler'
  | 'vercel'
  | 'render'
  | 'netlify'
  | 'terraform-cloud-scheduler'
  | 'terraform-eventbridge'
  | 'node-cron'
  | 'cron-parser'
  | 'spring-scheduled'
  | 'celery-beat';

/**
 * Where a finding's timezone came from. This is the crux of the tool:
 * an operator needs to know not just the zone but how confidently it
 * is known, because "defaulted by a platform rule" and "not knowable
 * from this file" carry very different risk.
 */
export type ZoneSource =
  /** Written in this file and attached to this entry. */
  | { kind: 'explicit'; zone: string }
  /** Inherited from a CRON_TZ or TZ line earlier in the same file. */
  | { kind: 'inherited'; zone: string; fromLine: number; via: 'CRON_TZ' | 'TZ' }
  /** Fixed by the platform's documented rule (for example Actions is UTC). */
  | { kind: 'platform-default'; zone: string; rule: string }
  /** Not determinable from the source. This is a finding in itself. */
  | { kind: 'unknown' };

/** A 1-based source position. Column counts UTF-16 code units. */
export interface SourcePosition {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
}

/** One schedule declaration located in the source tree. */
export interface ScheduleFinding {
  /** Repo-relative POSIX path of the file the schedule was found in. */
  file: string;
  /** 1-based line of the schedule value. */
  line: number;
  /** 1-based column of the schedule value's first character. */
  column: number;
  /** Which platform's schedule this is. */
  sourceKind: SourceKind;
  /** The cron dialect that governs the expression, when one applies. */
  dialect: DialectId | null;
  /**
   * Verbatim schedule expression, or null when the value could not be
   * resolved (for example an unexpanded Helm template).
   */
  expression: string | null;
  /**
   * 'resolved' when a concrete expression was read, 'unresolved' when
   * the value is a template or otherwise not statically knowable.
   */
  resolution: 'resolved' | 'unresolved';
  /** Where the timezone came from, including 'unknown'. */
  zoneSource: ZoneSource;
  /** Non-fatal notes attached to this finding (for example intent mismatch). */
  warnings: string[];
}

/** A finding that a valid suppression comment removed from the report. */
export interface SuppressedFinding {
  /** The finding that was suppressed. */
  finding: ScheduleFinding;
  /** The reason string the suppression comment carried. */
  reason: string;
  /** 1-based line of the suppression comment. */
  atLine: number;
}

/** A problem the scan itself hit: a bad suppression or an unreadable file. */
export interface ScanDiagnostic {
  /** Repo-relative POSIX path the diagnostic belongs to. */
  file: string;
  /** 1-based line, or 0 for a whole-file diagnostic. */
  line: number;
  /** Machine-stable diagnostic code. */
  code: 'suppression-missing-reason' | 'file-unreadable';
  /** What went wrong and what to do about it. */
  message: string;
}

/** The full result of scanning a tree. */
export interface ScanResult {
  /** Absolute path of the scanned root. */
  root: string;
  /** Every schedule found and not suppressed, in stable file/line order. */
  findings: ScheduleFinding[];
  /** Findings removed by a valid suppression comment, kept for the record. */
  suppressed: SuppressedFinding[];
  /** Scan-level problems, including reasonless suppressions. */
  diagnostics: ScanDiagnostic[];
  /** Count of files whose contents were read and scanned. */
  filesScanned: number;
}

/** A single file handed to a scanner: its path and decoded contents. */
export interface ScanFile {
  /** Repo-relative POSIX path. */
  path: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Decoded UTF-8 text. */
  text: string;
}

/**
 * Ambient facts a scanner may need that no single file can supply. The
 * only one so far is the set of zone names the run's tzdb actually
 * holds, which is what turns a zone string written in a workflow into
 * either an explicit zone or a typo, and what keeps a path-shaped
 * string like `issues/PRs` from being read as a zone reference.
 */
export interface ScanContext {
  /**
   * Zone names in the tzdb this run reads, or null when no tzdb could
   * be read at all. Null means the question is unanswerable, which a
   * scanner must treat as "cannot refute", never as "not a zone".
   * Implementations memoize; calling this is cheap after the first use.
   */
  knownZones: () => ReadonlySet<string> | null;
}

/**
 * A scanner: pure function from one file plus the ambient context to
 * zero or more findings. A scanner that needs nothing from the context
 * may declare only the file parameter.
 */
export type Scanner = (file: ScanFile, context: ScanContext) => ScheduleFinding[];
