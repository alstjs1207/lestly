import { generateTimeSlots } from "../schedules/utils/student-schedule-rules.ts";

export const DISABLED_BOOKING_TIMES_KEY = "disabled_booking_start_times";
export const BOOKING_START_TIMES = generateTimeSlots(30).map(
  (slot) => slot.value,
);

export function parseDisabledBookingTimes(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 1440 ||
    value.some(
      (time) =>
        typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time),
    )
  )
    throw new Error("invalid_booking_times");
  return [...new Set(value as string[])].sort();
}

export function disabledBookingTimesFromForm(form: FormData): string[] {
  if (form.get("booking_times_present") !== "1")
    throw new Error("invalid_booking_times");
  if (form.has("disabled_start_times"))
    return parseDisabledBookingTimes(
      JSON.parse(String(form.get("disabled_start_times"))),
    );
  const allowed = form.getAll("allowed_start_times");
  if (
    allowed.some(
      (time) => typeof time !== "string" || !BOOKING_START_TIMES.includes(time),
    )
  )
    throw new Error("invalid_booking_times");
  return BOOKING_START_TIMES.filter((time) => !allowed.includes(time));
}
