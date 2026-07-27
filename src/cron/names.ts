/**
 * Month and weekday name tables. Names always map to the same
 * canonical numbers regardless of a dialect's numeric convention:
 * months 1 through 12, weekdays 0 (Sunday) through 6 (Saturday).
 * Lookups are case-insensitive and accept the three-letter
 * abbreviation or the full name.
 */

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_FULL: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const WEEKDAY_FULL: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Canonical month number (1 to 12) for a name, or null when the text
 * is not a recognized month name.
 */
export function monthFromName(text: string): number | null {
  const key = text.toLowerCase();
  return MONTH_NAMES[key] ?? MONTH_FULL[key] ?? null;
}

/**
 * Canonical weekday number (0 Sunday to 6 Saturday) for a name, or
 * null when the text is not a recognized weekday name.
 */
export function weekdayFromName(text: string): number | null {
  const key = text.toLowerCase();
  return WEEKDAY_NAMES[key] ?? WEEKDAY_FULL[key] ?? null;
}
