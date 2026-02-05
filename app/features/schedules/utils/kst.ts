/**
 * KST (Korea Standard Time, UTC+9) timezone utilities.
 *
 * Ensures correct date/time handling regardless of
 * the server's system timezone (e.g., UTC on Vercel).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Get KST date/time components from a UTC Date object.
 */
export function toKST(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(), // 0-indexed
    day: kst.getUTCDate(),
    hours: kst.getUTCHours(),
    minutes: kst.getUTCMinutes(),
    seconds: kst.getUTCSeconds(),
  };
}

/**
 * Get current KST date/time components.
 */
export function nowKST() {
  return toKST(new Date());
}

/**
 * Create a UTC Date from KST date/time components.
 * month is 0-indexed (0 = January).
 * The returned Date's .toISOString() gives the correct UTC representation.
 */
export function fromKST(
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  return new Date(
    Date.UTC(year, month, day, hours - 9, minutes, seconds, ms),
  );
}

/**
 * Convert a UTC Date to a "YYYY-MM-DD" string in KST.
 */
export function toKSTDateString(date: Date): string {
  const { year, month, day } = toKST(date);
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}
