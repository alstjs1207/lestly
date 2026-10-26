import { parseCalendarMonth } from "./calendar-month.ts";
import { toKSTDateString } from "./kst.ts";

export function isStudentScheduleDate(value: string) {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "2100-12-31"
  );
}

// Civil date arithmetic uses UTC fields so a viewer's timezone or DST cannot
// shift the seven Korean calendar dates shown by the week picker.
export function shiftStudentDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function studentWeekDates(value: string) {
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  const monday = shiftStudentDate(value, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) =>
    shiftStudentDate(monday, index),
  );
}

export function parseStudentScheduleDate(
  params: URLSearchParams,
  now = new Date(),
) {
  const requested = params.get("date");
  if (requested !== null) {
    if (!isStudentScheduleDate(requested))
      throw new Response("Invalid schedule date", { status: 400 });
    return requested;
  }
  const today = toKSTDateString(now);
  if (params.get("book")) return today;
  const { year, month } = parseCalendarMonth(params, now);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return today.startsWith(first.slice(0, 7)) ? today : first;
}

// The loader already includes the selected month and adjacent boundary days.
// Day/week selection within that month only needs a fresh availability request;
// mutations, explicit refreshes and month changes must still reload schedules.
export function revalidateStudentCalendar({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  formMethod?: string;
  defaultShouldRevalidate: boolean;
}) {
  if (
    !defaultShouldRevalidate ||
    formMethod ||
    currentUrl.pathname !== nextUrl.pathname ||
    currentUrl.href === nextUrl.href ||
    !nextUrl.searchParams.has("date")
  )
    return defaultShouldRevalidate;

  const currentParams = new URLSearchParams(currentUrl.search);
  const nextParams = new URLSearchParams(nextUrl.search);
  try {
    const currentDate = parseStudentScheduleDate(currentParams);
    const nextDate = parseStudentScheduleDate(nextParams);
    currentParams.delete("date");
    nextParams.delete("date");
    return (
      currentParams.toString() !== nextParams.toString() ||
      currentDate.slice(0, 7) !== nextDate.slice(0, 7)
    );
  } catch {
    return defaultShouldRevalidate;
  }
}
