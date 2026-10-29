import {
  type BookingPolicy,
  DEFAULT_BOOKING_POLICY,
  bookingStartTimes,
} from "../../app-settings/booking-policy.ts";
/**
 * Student Schedule Rules
 *
 * Business logic for student schedule registration and cancellation rules.
 */
import {
  bookingWindowRange,
  isBookingDateInWindow,
} from "../../app-settings/booking-window.ts";
import {
  type CancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
  canCancelWithPolicy,
} from "../../app-settings/cancellation-policy.ts";
import { fromKST, toKST, toKSTDateString } from "./kst.ts";

/** Check the organization's booking window using the Korean start date. */
export function canStudentRegisterSchedule(
  date: Date,
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
  now = new Date(),
): boolean {
  return isBookingDateInWindow(
    toKSTDateString(date),
    policy.bookingWindow,
    now,
  );
}

/** Uses the reservation's saved policy, never the current organization setting. */
export function canStudentCancelSchedule(
  scheduleDate: Date,
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
  now = new Date(),
): boolean {
  return canCancelWithPolicy(scheduleDate, policy, now);
}

/** Inclusive calendar date bounds; past times are checked separately. */
export function getStudentAllowedDateRange(
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
  now = new Date(),
) {
  return bookingWindowRange(policy.bookingWindow, now);
}

/**
 * Generate time slots for schedule registration
 * Time range: 09:00 - 20:00 (last start time for 3-hour class)
 */
export function generateTimeSlots(
  intervalMinutes: number = 30,
): { label: string; value: string }[] {
  return bookingStartTimes({
    ...DEFAULT_BOOKING_POLICY,
    startIntervalMinutes: intervalMinutes,
  }).map((time) => ({ label: time, value: time }));
}

/**
 * Duration options for schedule registration
 * 1 타임 = 3시간
 */
export const DURATION_OPTIONS = [
  { value: "1", label: "1타임 (3시간)", hours: 3 },
  { value: "2", label: "2타임 (6시간)", hours: 6 },
  { value: "3", label: "3타임 (9시간)", hours: 9 },
] as const;

/**
 * Calculate end time based on start time and duration
 */
export function calculateEndTime(startTime: Date, durationHours: number): Date {
  return new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
}

/**
 * Parse date string (YYYY-MM-DD) as KST midnight.
 * Returns a UTC Date representing 00:00 KST on the given date.
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return fromKST(year, month - 1, day);
}

/**
 * Parse time string (HH:MM) and apply to a date as KST time.
 */
export function applyTimeToDate(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  const kst = toKST(date);
  return fromKST(kst.year, kst.month, kst.day, hours, minutes);
}
