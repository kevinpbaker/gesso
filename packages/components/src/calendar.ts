/**
 * Dates as the date picker holds them: `YYYY-MM-DD` strings.
 *
 * A calendar date isn't an instant, and holding one as a `Date` invites
 * the bug every date picker ships once: midnight local time, read back
 * in UTC, is the day before. A string has no time zone to be wrong in.
 * The arithmetic here goes through UTC `Date`s only, where a day is
 * always 24 hours, and comes straight back to a string.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The date as a UTC midnight, or null when it isn't a real `YYYY-MM-DD` date. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO.exec(value);
  if (match === null) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // 2026-02-30 rolls over to March; a date that does isn't one.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function isoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today in the local time zone, which is what "today" means to the person looking. */
export function todayIso(now: Date = new Date()): string {
  return isoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value)!;
  return isoDate(new Date(date.getTime() + days * 86_400_000));
}

/** Months later or earlier, keeping the day where the month has it and the month's last day where it doesn't. */
export function addMonths(value: string, months: number): string {
  const date = parseIsoDate(value)!;
  const target = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), last))));
}

/** 0 for Sunday through 6 for Saturday. */
export function weekday(value: string): number {
  return parseIsoDate(value)!.getUTCDay();
}

/** The first day of the week `value` is in, for a week that starts on `weekStart`. */
export function startOfWeek(value: string, weekStart: number): string {
  return addDays(value, -((weekday(value) - weekStart + 7) % 7));
}

/**
 * The days a month's page shows: whole weeks from the one holding the
 * 1st to the one holding the last day, so 4 to 6 rows of 7.
 */
export function monthGrid(month: string, weekStart: number): string[][] {
  const first = `${month.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let day = startOfWeek(first, weekStart); day <= last;) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** Keeps a date within `min` and `max`, either of which may be empty. */
export function clampDate(value: string, min: string, max: string): string {
  if (min !== '' && value < min) {
    return min;
  }
  if (max !== '' && value > max) {
    return max;
  }
  return value;
}

/** Formats a date in the reader's language, as a calendar date (never shifted by a time zone). */
export function formatDate(value: string, options: Intl.DateTimeFormatOptions, locale?: string): string {
  const date = parseIsoDate(value);
  return date === null ? '' : new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
}
