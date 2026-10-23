import { generateTimeSlots } from "../schedules/utils/student-schedule-rules.ts";

export const DISABLED_BOOKING_TIMES_KEY = "disabled_booking_start_times";
export const BOOKING_START_TIMES = generateTimeSlots(30).map(
  (slot) => slot.value,
);

export function parseDisabledBookingTimes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((time) => !BOOKING_START_TIMES.includes(time))
  )
    throw new Error("invalid_booking_times");
  return BOOKING_START_TIMES.filter((time) => value.includes(time));
}

export function disabledBookingTimesFromForm(form: FormData): string[] {
  if (form.get("booking_times_present") !== "1")
    throw new Error("invalid_booking_times");
  const allowed = form.getAll("allowed_start_times");
  if (
    allowed.some(
      (time) => typeof time !== "string" || !BOOKING_START_TIMES.includes(time),
    )
  )
    throw new Error("invalid_booking_times");
  return BOOKING_START_TIMES.filter((time) => !allowed.includes(time));
}
