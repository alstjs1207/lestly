/**
 * RRule Helper Functions
 *
 * Utilities for working with rrule.js for recurring schedules.
 */
import pkg from "rrule";

const { RRule } = pkg;

/**
 * Generate weekly recurrence dates from start date to end date
 */
export function generateWeeklyDates(
  startDate: Date,
  endDate: Date,
): Date[] {
  const rule = new RRule({
    freq: RRule.WEEKLY,
    dtstart: startDate,
    until: endDate,
  });

  return rule.all();
}

/**
 * Create an rrule string for weekly recurrence
 */
export function createWeeklyRRule(startDate: Date, endDate: Date): string {
  const rule = new RRule({
    freq: RRule.WEEKLY,
    dtstart: startDate,
    until: endDate,
  });

  return rule.toString();
}

/**
 * Parse an rrule string and get all occurrence dates
 */
export function parseRRule(rruleString: string): Date[] {
  const rule = RRule.fromString(rruleString);
  return rule.all();
}

/**
 * Get remaining occurrences from an rrule string starting from a date
 */
export function getRemainingOccurrences(
  rruleString: string,
  fromDate: Date,
): Date[] {
  const rule = RRule.fromString(rruleString);
  return rule.after(fromDate, true) ? rule.between(fromDate, rule.options.until || new Date(9999, 11, 31), true) : [];
}

/**
 * Check if a date is a valid occurrence in an rrule
 */
export function isValidOccurrence(rruleString: string, date: Date): boolean {
  const rule = RRule.fromString(rruleString);
  const occurrences = rule.all();
  return occurrences.some(
    (occurrence) =>
      occurrence.getFullYear() === date.getFullYear() &&
      occurrence.getMonth() === date.getMonth() &&
      occurrence.getDate() === date.getDate(),
  );
}
