import { isBookingDayDisabled } from "../../app-settings/booking-days.ts";
import {
  type BookingPolicy,
  DEFAULT_BOOKING_POLICY,
  bookingStartTimes,
} from "../../app-settings/booking-policy.ts";
import {
  bookingWindowDescription,
  isBookingDateInWindow,
} from "../../app-settings/booking-window.ts";
import { toKSTDateString } from "./kst.ts";

export interface CourseDates {
  programId?: number;
  classStartDate: string | null;
  classEndDate: string | null;
  disabledBookingDays?: number[];
  bookingPolicy?: BookingPolicy;
}
export function bookingDateReason(
  date: string,
  course: CourseDates,
  now = new Date(),
): string | null {
  const today = toKSTDateString(now);
  if (date < today) return "지난 날짜에는 수업을 예약할 수 없어요.";
  if (
    (course.classStartDate && date < course.classStartDate) ||
    (course.classEndDate && date > course.classEndDate)
  )
    return "수강 기간에 포함된 날짜를 선택해주세요.";
  const window = (course.bookingPolicy ?? DEFAULT_BOOKING_POLICY).bookingWindow;
  if (!isBookingDateInWindow(date, window, now))
    return `${bookingWindowDescription(window)} 이미 등록된 일정은 확인할 수 있어요.`;
  if (isBookingDayDisabled(date, course.disabledBookingDays ?? []))
    return "이 요일은 휴무일로 신규 예약을 받지 않아요. 다른 날짜를 선택해주세요.";
  return null;
}

export function bookingSlotReason(
  date: string,
  time: string,
  hours: number,
  course: CourseDates,
  schedules: { start_time: string; end_time: string }[],
  now = new Date(),
): string | null {
  const dateReason = bookingDateReason(date, course, now);
  if (dateReason) return dateReason;
  const start = new Date(`${date}T${time}:00+09:00`);
  const end = new Date(start.getTime() + hours * 3_600_000);
  if (!Number.isFinite(start.getTime()) || start <= now)
    return "이미 지난 시작 시각이에요.";
  const policy = course.bookingPolicy ?? DEFAULT_BOOKING_POLICY;
  if (
    !policy.durationMinutes.includes(Math.round(hours * 60)) ||
    !bookingStartTimes(policy).includes(time)
  )
    return "수업 길이와 시작 시간 설정을 다시 확인해주세요.";
  if (+start < +now + policy.leadMinutes * 60_000)
    return "이 수업의 예약 접수가 마감됐어요.";
  if (
    schedules.some(
      (s) => new Date(s.start_time) < end && new Date(s.end_time) > start,
    )
  )
    return "내 다른 수업과 시간이 겹쳐요.";
  return null;
}

// Calendar controls represent civil dates in the viewer's calendar. Interpret
// those fields as KST rather than converting their local-midnight timestamp.
export function calendarDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
