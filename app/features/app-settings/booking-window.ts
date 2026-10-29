import { z } from "zod";

import { fromKST, toKST, toKSTDateString } from "../schedules/utils/kst.ts";

export const BOOKING_WINDOW_KEY = "booking_window";

export const bookingWindowSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("monthly"),
      openingDay: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      mode: z.literal("rolling"),
      daysAhead: z.number().int().min(0).max(365),
    })
    .strict(),
]);
export type BookingWindow = z.infer<typeof bookingWindowSchema>;
export const DEFAULT_BOOKING_WINDOW: BookingWindow = {
  mode: "monthly",
  openingDay: 25,
};

// Inclusive civil dates, calculated entirely in Korea time. A booking is
// constrained by its start date; a lesson may finish on the following day.
export function bookingWindowRange(
  window: BookingWindow = DEFAULT_BOOKING_WINDOW,
  now = new Date(),
) {
  bookingWindowSchema.parse(window);
  const kst = toKST(now);
  const startDate = fromKST(kst.year, kst.month, kst.day);
  const lastDay = toKST(fromKST(kst.year, kst.month + 1, 0)).day;
  const endExclusive =
    window.mode === "rolling"
      ? fromKST(kst.year, kst.month, kst.day + window.daysAhead + 1)
      : fromKST(
          kst.year,
          kst.month + (kst.day >= Math.min(window.openingDay, lastDay) ? 2 : 1),
          1,
        );
  return { startDate, endDate: new Date(+endExclusive - 1), endExclusive };
}

export function isBookingDateInWindow(
  date: string,
  window: BookingWindow = DEFAULT_BOOKING_WINDOW,
  now = new Date(),
) {
  const range = bookingWindowRange(window, now);
  return (
    date >= toKSTDateString(range.startDate) &&
    date < toKSTDateString(range.endExclusive)
  );
}

export function bookingWindowDescription(
  window: BookingWindow = DEFAULT_BOOKING_WINDOW,
) {
  if (window.mode === "rolling")
    return window.daysAhead === 0
      ? "신규 예약은 오늘 수업만 신청할 수 있어요."
      : `신규 예약은 오늘부터 ${window.daysAhead}일 뒤까지 신청할 수 있어요.`;
  return `다음 달 신규 예약은 매월 ${window.openingDay}일 00시(한국 시간)에 열려요.${window.openingDay > 28 ? " 해당 날짜가 없는 달에는 말일에 열려요." : ""}`;
}

export function bookingWindowFromForm(form: FormData): BookingWindow {
  const mode = form.get("bookingWindowMode");
  const key = mode === "monthly" ? "bookingOpeningDay" : "bookingDaysAhead";
  const raw = form.get(key);
  const value =
    typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return bookingWindowSchema.parse(
    mode === "monthly"
      ? { mode, openingDay: value }
      : { mode, daysAhead: value },
  );
}
