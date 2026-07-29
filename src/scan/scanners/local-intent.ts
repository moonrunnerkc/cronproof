/**
 * Detects a claim of local wall-clock intent in the prose around a
 * schedule: a comment, a workflow name, anything a human wrote next to
 * a cron string. It exists for platforms whose zone is fixed by the
 * platform rather than by the file, where "run at midnight" and a UTC
 * schedule are a silent hour-offset bug.
 *
 * The patterns are split by case on purpose. "midnight" and "9am" mean
 * the same thing in any case, but a three-letter zone abbreviation only
 * means a zone in upper case: compiled case-insensitively, EST also
 * matches "test", and `[A-Z]{3,4}\s*time` also matches "daytime",
 * "Showtime", and "the time". One combined /i pattern silently disabled
 * both case-dependent alternatives and produced pure noise, and noise is
 * what teaches people to ignore a warning class.
 *
 * The zone-path check is the same lesson in another form: an
 * unanchored [A-Za-z]+/[A-Za-z_]+ matches every slash pair in a file
 * (issues/PRs, Fedora/Rawhide, com/web). Zone names are an enumerable
 * set, so a candidate is matched loosely and then confirmed against the
 * tzdb the run reads, which is the only test that admits America/New_York
 * and rejects the rest.
 */

/**
 * Wording whose meaning does not depend on case: an explicit mention of
 * local time, a named time of day, or a clock time with am/pm.
 */
const CASE_INSENSITIVE_INTENT =
  /\b(?:local(?:\s*time)?|midnight|noon|morning|evening|overnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

/**
 * Zone abbreviations, which mean a zone only in upper case. The set is
 * deliberately not Americas-only: the old [ECMP][SD]T class could not
 * match CET, BST, or JST at all, so it missed every European and Asian
 * local-time comment.
 */
const ZONE_ABBREVIATION =
  /\b(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|CET|CEST|WET|WEST|EET|EEST|BST|GMT|IST|JST|KST|AEST|AEDT|ACST|ACDT|AWST|NZST|NZDT)\b/;

/**
 * An upper-case abbreviation followed by the word "time", as in
 * "EST time" or "PST Time". The space is required: with `\s*` the same
 * pattern matched "daytime" and "Showtime". UTC is excluded because it
 * states the opposite of local intent.
 */
const ABBREVIATED_TIME_PHRASE = /\b(?!UTC\b)[A-Z]{3,4}\s+[Tt]ime\b/;

/** Slash-separated candidates that a real zone name could look like. */
const ZONE_CANDIDATE = /[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+/g;

/**
 * Whether the text names a zone the tzdb actually holds.
 * @param text Prose to search.
 * @param knownZones Zone names of the run's tzdb, or null when unreadable.
 * @returns True only when a candidate matches a real zone name.
 */
export function mentionsKnownZone(text: string, knownZones: ReadonlySet<string> | null): boolean {
  if (knownZones === null) {
    return false;
  }
  for (const match of text.matchAll(ZONE_CANDIDATE)) {
    if (knownZones.has(match[0])) {
      return true;
    }
  }
  return false;
}

/**
 * Whether prose near a schedule implies a local wall-clock intent.
 * @param text The comment, name, and surrounding prose to search.
 * @param knownZones Zone names of the run's tzdb, or null when unreadable.
 * @returns True when local intent is claimed, by wording, by an
 *          upper-case zone abbreviation, or by a real IANA zone name.
 */
export function hasLocalIntent(text: string, knownZones: ReadonlySet<string> | null): boolean {
  return (
    CASE_INSENSITIVE_INTENT.test(text) ||
    ZONE_ABBREVIATION.test(text) ||
    ABBREVIATED_TIME_PHRASE.test(text) ||
    mentionsKnownZone(text, knownZones)
  );
}
