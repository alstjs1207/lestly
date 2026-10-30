import {
  type BookingPolicy,
  DEFAULT_BOOKING_POLICY,
  bookingStartTimes,
} from "../../app-settings/booking-policy.ts";
import { formatLearningTime } from "./learning-records.ts";
import { type CourseDates, bookingSlotReason } from "./student-booking.ts";

export interface BookingAvailability {
  key: string;
  disabledTimes?: string[];
  disabledDays?: number[];
  bookingPolicy?: BookingPolicy;
  slots:
    | {
        start_time: string;
        available: boolean;
        reason: string | null;
      }[]
    | null;
}

export function calendarMonthDays(year: number, month: number) {
  const offset = new Date(year, month - 1, 1).getDay();
  return Array.from(
    { length: 42 },
    (_, i) => new Date(year, month - 1, 1 - offset + i),
  );
}

// Never apply a capacity response for a previously selected date or duration.
export function desktopBookingSlots(
  date: string,
  hours: number,
  course: CourseDates,
  schedules: { start_time: string; end_time: string }[],
  now: Date,
  availability: BookingAvailability | undefined,
) {
  const current =
    availability?.key ===
    `${course.programId === undefined ? "" : `${course.programId}:`}${date}:${hours}`;
  const slots = current ? availability.slots : null;
  const disabledTimes = current ? (availability.disabledTimes ?? []) : [];
  const bookingCourse =
    current && availability.disabledDays
      ? { ...course, disabledBookingDays: availability.disabledDays }
      : course;
  const policy =
    current && availability.bookingPolicy
      ? availability.bookingPolicy
      : (course.bookingPolicy ?? DEFAULT_BOOKING_POLICY);
  return bookingStartTimes(policy)
    .map((value) => ({ value }))
    .filter(
      ({ value: time }) =>
        !disabledTimes.includes(time) &&
        !slots?.some(
          (slot) =>
            formatLearningTime(slot.start_time) === time &&
            slot.reason === "disabled",
        ),
    )
    .map(({ value: time }) => {
      let reason = bookingSlotReason(
        date,
        time,
        hours,
        { ...bookingCourse, bookingPolicy: policy },
        schedules,
        now,
      );
      if (!reason && current && slots === null)
        reason =
          "예약 가능 여부를 불러오지 못했어요. 잠시 후 다시 확인해주세요.";
      let label = reason?.includes("지난")
        ? "지난 시간"
        : reason?.includes("마감")
          ? "접수 마감"
          : reason?.includes("겹")
            ? "내 수업"
            : reason
              ? "예약 불가"
              : null;
      const slot = slots?.find(
        (s) => formatLearningTime(s.start_time) === time,
      );
      if (!reason && slots && !slot) {
        reason = "예약 가능 여부를 확인할 수 없는 시간이에요.";
        label = "확인 불가";
      } else if (!reason && slot && !slot.available) {
        const reasons: Record<string, [string, string]> = {
          day_disabled: [
            "이 요일은 휴무일로 신규 예약을 받지 않아요.",
            "휴무일",
          ],
          closed: ["이 수업의 예약 접수가 마감됐어요.", "접수 마감"],
          past: ["이미 지난 시작 시각이에요.", "지난 시간"],
          outside_course: ["수강 기간 밖의 날짜예요.", "예약 불가"],
          student_conflict: ["내 다른 수업과 겹쳐요.", "내 수업"],
          capacity: ["정원이 찼어요.", "정원 마감"],
        };
        [reason, label] = reasons[slot.reason ?? ""] ?? [
          "예약할 수 없는 시간이에요.",
          "예약 불가",
        ];
      }
      return { time, reason, label };
    });
}
