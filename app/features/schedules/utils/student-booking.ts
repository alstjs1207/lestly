import { isBookingDayDisabled } from "../../app-settings/booking-days.ts";
import { fromKST, toKST, toKSTDateString } from "./kst.ts";

export interface CourseDates {
  classStartDate: string | null;
  classEndDate: string | null;
  disabledBookingDays?: number[];
}
export function bookingDateReason(
  date: string,
  course: CourseDates,
  now = new Date(),
): string | null {
  const today = toKSTDateString(now);
  const kst = toKST(now);
  const lastDay = toKSTDateString(
    fromKST(kst.year, kst.month + (kst.day >= 25 ? 2 : 1), 0),
  );
  if (date < today) return "지난 날짜에는 수업을 예약할 수 없어요.";
  if (
    (course.classStartDate && date < course.classStartDate) ||
    (course.classEndDate && date > course.classEndDate)
  )
    return "수강 기간에 포함된 날짜를 선택해주세요.";
  if (date > lastDay)
    return "다음 달 신규 예약은 매월 25일에 열려요. 이미 등록된 일정은 확인할 수 있어요.";
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
