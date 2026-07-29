/**
 * Public surface of the repository scanner. `scanRepo` walks a tree (or
 * a single file), finds every schedule a supported platform understands
 * with its file, line, and column, records where each schedule's
 * timezone came from (including UNKNOWN), reports Helm-templated
 * schedules as UNRESOLVED, and honors .cronproofignore and inline
 * suppression comments that must state a reason.
 */

export { scanRepo } from './scan-repo';
export type { ScanOptions } from './scan-repo';
export { scannersFor } from './detect';
export { describeZoneSource } from './describe';
export type { ZoneDisplay } from './describe';
export { parseSuppressions, suppressionFor } from './suppression';
export type { SuppressionDirective } from './suppression';
export { compileIgnore, ALWAYS_IGNORED_DIRS } from './glob-ignore';
export type { IgnoreMatcher } from './glob-ignore';
export { LineIndex } from './text-locate';
export type {
  ScanContext,
  ScanDiagnostic,
  ScanFile,
  ScanResult,
  ScheduleFinding,
  Scanner,
  SourceKind,
  SourcePosition,
  SuppressedFinding,
  ZoneSource,
} from './types';
