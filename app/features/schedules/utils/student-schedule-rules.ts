/**
 * Student Schedule Rules
 *
 * Business logic for student schedule registration and cancellation rules.
 */
import { fromKST, nowKST, toKST } from "./kst";

/**
 * Check if a student can register a schedule for a given date
 *
 * Rules:
 * - Can register for the current month
 * - After the 25th, can also register for the next month
 */
export function canStudentRegisterSchedule(date: Date): boolean {
  const now = nowKST();
  const target = toKST(date);

  // Same month and year - allowed
  if (target.year === now.year && target.month === now.month) {
    return true;
  }

  // After 25th, can register for next month
  if (now.day >= 25) {
    const nextMonth = now.month === 11 ? 0 : now.month + 1;
    const nextYear = now.month === 11 ? now.year + 1 : now.year;

    if (target.year === nextYear && target.month === nextMonth) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a student can cancel a schedule
 *
 * Rules:
 * - Cannot cancel on the same day (must be at least one day before)
 */
export function canStudentCancelSchedule(scheduleDate: Date): boolean {
  const now = nowKST();
  const schedule = toKST(scheduleDate);

  // Compare KST dates (year * 10000 + month * 100 + day for simple comparison)
  const todayValue = now.year * 10000 + now.month * 100 + now.day;
  const scheduleValue = schedule.year * 10000 + schedule.month * 100 + schedule.day;

  // Can only cancel if the schedule is after today
  return scheduleValue > todayValue;
}

/**
 * Get the allowed registration date range for students
 *
 * Returns the start and end dates that a student can register schedules for.
 */
export function getStudentAllowedDateRange(): { startDate: Date; endDate: Date } {
  const now = nowKST();

  // Start date is always the first of the current month (KST)
  const startDate = fromKST(now.year, now.month, 1);

  // End date depends on whether we're past the 25th
  let endDate: Date;
  if (now.day >= 25) {
    // Can register until the end of next month (KST)
    const nextMonth = now.month === 11 ? 0 : now.month + 1;
    const nextYear = now.month === 11 ? now.year + 1 : now.year;
    endDate = fromKST(nextYear, nextMonth + 1, 0, 23, 59, 59);
  } else {
    // Can only register until the end of current month (KST)
    endDate = fromKST(now.year, now.month + 1, 0, 23, 59, 59);
  }

  return { startDate, endDate };
}

/**
 * Generate time slots for schedule registration
 * Time range: 09:00 - 20:00 (last start time for 3-hour class)
 */
export function generateTimeSlots(
  intervalMinutes: number = 30,
): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = [];
  const startHour = 9;  // 09:00 시작
  const endHour = 20;   // 20:00 까지 (마지막 시작 시간)

  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      // 20:00 이후는 제외 (20:00은 포함)
      if (hour === endHour && minute > 0) break;

      const hourStr = hour.toString().padStart(2, "0");
      const minuteStr = minute.toString().padStart(2, "0");
      const timeStr = `${hourStr}:${minuteStr}`;
      slots.push({
        label: timeStr,
        value: timeStr,
      });
    }
  }

  return slots;
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
