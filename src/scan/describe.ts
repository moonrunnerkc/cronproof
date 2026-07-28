/**
 * Presentation helpers that turn a ZoneSource discriminated union into
 * short strings for a table row, keeping the rendering logic out of the
 * scanners and the CLI command.
 */

import type { ZoneSource } from './types';

/** A zone and a one-word provenance label for a finding row. */
export interface ZoneDisplay {
  /** The IANA zone or "UNKNOWN" when it cannot be determined. */
  zone: string;
  /** Short provenance: explicit, inherited, platform, or unknown. */
  source: string;
  /** Longer human phrase describing where the zone came from. */
  detail: string;
}

/**
 * Renders a zone source for display.
 * @param zoneSource The finding's zone source.
 * @returns Zone text, a short source word, and a longer detail phrase.
 */
export function describeZoneSource(zoneSource: ZoneSource): ZoneDisplay {
  switch (zoneSource.kind) {
    case 'explicit':
      return { zone: zoneSource.zone, source: 'explicit', detail: 'set explicitly in the file' };
    case 'inherited':
      return {
        zone: zoneSource.zone,
        source: 'inherited',
        detail: `inherited from ${zoneSource.via} at line ${zoneSource.fromLine}`,
      };
    case 'platform-default':
      return {
        zone: zoneSource.zone,
        source: 'platform',
        detail: zoneSource.rule,
      };
    case 'unknown':
      return { zone: 'UNKNOWN', source: 'unknown', detail: 'zone cannot be determined from source' };
  }
}
