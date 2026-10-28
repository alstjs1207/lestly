// Match PostgreSQL extract(dow): Sunday = 0, Monday = 1, ... Saturday = 6.
export const DISABLED_BOOKING_DAYS_KEY = "disabled_booking_weekdays";
export const BOOKING_WEEKDAYS = [
  { value: 1, label: "월요일" },
  { value: 2, label: "화요일" },
  { value: 3, label: "수요일" },
  { value: 4, label: "목요일" },
  { value: 5, label: "금요일" },
  { value: 6, label: "토요일" },
  { value: 0, label: "일요일" },
];

export function parseDisabledBookingDays(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error("invalid_booking_days");
  return BOOKING_WEEKDAYS.map((day) => day.value).filter((day) =>
    value.includes(day),
  );
}

export function disabledBookingDaysFromForm(form: FormData): number[] {
  if (form.get("booking_days_present") !== "1")
    throw new Error("invalid_booking_days");
  const days = form.getAll("disabled_weekdays");
  if (days.some((day) => typeof day !== "string" || !/^[0-6]$/.test(day)))
    throw new Error("invalid_booking_days");
  return parseDisabledBookingDays(days.map(Number));
}

// The input is a Korean civil date, independent of the browser/server timezone.
export function isBookingDayDisabled(date: string, disabledDays: number[]) {
  return disabledDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}
