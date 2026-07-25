/**
 * Public surface of the timezone engine: two independent backends
 * behind one interface, wall-clock resolution as a three-way
 * discriminated union, the backend cross-check, and tzdb version
 * reporting.
 */

export type {
  AmbiguousResolution,
  LocalWallFields,
  NonexistentResolution,
  OffsetInfo,
  TzBackend,
  UniqueResolution,
  WallClockResolution,
  ZoneTransition,
} from './types';
export { createIntlBackend } from './intl-backend';
export { createTzifBackend } from './tzif-backend';
export type { TzifBackend, TzifBackendOptions } from './tzif-backend';
export { resolveWallClock } from './resolve-wall-clock';
export { crossCheckZone, runCrossCheck } from './cross-check';
export type {
  CrossCheckDisagreement,
  CrossCheckOptions,
  CrossCheckReport,
  ZoneCheckResult,
} from './cross-check';
export { tzdbVersions, tzdbVersionWarning } from './versions';
export type { TzdbVersions } from './versions';
export {
  listZones,
  readZoneinfoVersion,
  resolveZoneinfoRoot,
  SYSTEM_ZONEINFO_ROOT,
  vendoredZoneinfoRoot,
} from './zoneinfo-source';
export { parseTzif } from './tzif-parse';
export type { TzifData, TzifType } from './tzif-parse';
export { parsePosixTz, ruleInstantUtcMillis } from './posix-tz';
export type { PosixDayRule, PosixRule, PosixTz } from './posix-tz';
export {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  DAY_MILLIS,
  fieldsFromWallMillis,
  isLeapYear,
  wallMillisFromFields,
  weekdayFromDays,
} from './civil-date';
