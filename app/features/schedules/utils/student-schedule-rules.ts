/**
 * Student Schedule Rules
 *
 * Business logic for student schedule registration and cancellation rules.
 */

/**
 * Check if a student can register a schedule for a given date
 *
 * Rules:
 * - Can register for the current month
 * - After the 25th, can also register for the next month
 */
export function canStudentRegisterSchedule(date: Date): boolean {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const currentDay = today.getDate();

  const targetMonth = date.getMonth();
  const targetYear = date.getFullYear();

  // Same month and year - allowed
  if (targetYear === currentYear && targetMonth === currentMonth) {
    return true;
  }

  // After 25th, can register for next month
  if (currentDay >= 25) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

    if (targetYear === nextYear && targetMonth === nextMonth) {
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduleDay = new Date(scheduleDate);
  scheduleDay.setHours(0, 0, 0, 0);

  // Can only cancel if the schedule is after today
  return scheduleDay > today;
}

/**
 * Get the allowed registration date range for students
 *
 * Returns the start and end dates that a student can register schedules for.
 */
export function getStudentAllowedDateRange(): { startDate: Date; endDate: Date } {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const currentDay = today.getDate();

  // Start date is always the first of the current month
  const startDate = new Date(currentYear, currentMonth, 1);

  // End date depends on whether we're past the 25th
  let endDate: Date;
  if (currentDay >= 25) {
    // Can register until the end of next month
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    endDate = new Date(nextYear, nextMonth + 1, 0, 23, 59, 59);
  } else {
    // Can only register until the end of current month
    endDate = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
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
  const endTime = new Date(startTime);
  endTime.setHours(endTime.getHours() + durationHours);
  return endTime;
}

/**
 * Parse date string (YYYY-MM-DD) as local timezone
 * Avoids UTC interpretation issue with new Date("YYYY-MM-DD")
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Parse time string (HH:MM) and apply to a date
 */
export function applyTimeToDate(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
