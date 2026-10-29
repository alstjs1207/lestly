import { fromKST, toKST, toKSTDateString } from "./kst.ts";

export interface LearningSchedule {
  schedule_id: number;
  start_time: string;
  end_time: string;
  attendance_status?: string;
  cancellation_policy?: unknown;
  program: {
    program_id: number;
    title: string;
    location_address?: string | null;
    location_type?: string | null;
    instructor?: { name: string } | null;
  } | null;
}

export function scheduleHours(
  schedule: Pick<LearningSchedule, "start_time" | "end_time">,
) {
  const hours =
    (Date.parse(schedule.end_time) - Date.parse(schedule.start_time)) /
    3_600_000;
  return Number.isFinite(hours) ? Math.max(0, hours) : 0;
}

export function completedSchedules<
  T extends Pick<
    LearningSchedule,
    "start_time" | "end_time" | "attendance_status"
  >,
>(schedules: T[], now: Date) {
  return schedules.filter(
    (s) =>
      s.attendance_status === "PRESENT" &&
      Date.parse(s.end_time) <= now.getTime() &&
      scheduleHours(s) > 0,
  );
}

export function sumScheduleHours(
  schedules: Pick<
    LearningSchedule,
    "start_time" | "end_time" | "attendance_status"
  >[],
) {
  return (
    Math.round(schedules.reduce((sum, s) => sum + scheduleHours(s), 0) * 10) /
    10
  );
}

export function learningHeatmap(
  schedules: Pick<
    LearningSchedule,
    "start_time" | "end_time" | "attendance_status"
  >[],
  now: Date,
) {
  const kst = toKST(now);
  const weekday =
    (new Date(Date.UTC(kst.year, kst.month, kst.day)).getUTCDay() + 6) % 7;
  const start = fromKST(kst.year, kst.month, kst.day - weekday - 77);
  const hoursByDay = new Map<string, number>();
  const countsByDay = new Map<string, number>();
  for (const schedule of completedSchedules(schedules, now)) {
    const date = toKSTDateString(new Date(schedule.start_time));
    hoursByDay.set(date, (hoursByDay.get(date) ?? 0) + scheduleHours(schedule));
    countsByDay.set(date, (countsByDay.get(date) ?? 0) + 1);
  }
  const today = toKSTDateString(now);
  return Array.from({ length: 84 }, (_, index) => {
    const date = toKSTDateString(
      new Date(start.getTime() + index * 86_400_000),
    );
    return {
      date,
      hours: Math.round((hoursByDay.get(date) ?? 0) * 10) / 10,
      minutes: Math.round((hoursByDay.get(date) ?? 0) * 60),
      count: countsByDay.get(date) ?? 0,
      future: date > today,
    };
  });
}

export function formatLearningDate(value: string | Date, full = false) {
  return new Date(value).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(full ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function formatLearningTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function scheduleTimeRange(
  schedule: Pick<LearningSchedule, "start_time" | "end_time">,
) {
  const overnight =
    toKSTDateString(new Date(schedule.start_time)) !==
    toKSTDateString(new Date(schedule.end_time));
  return `${formatLearningTime(schedule.start_time)} — ${overnight ? `${formatLearningDate(schedule.end_time)} ` : ""}${formatLearningTime(schedule.end_time)}`;
}

export function coursePeriodSummary(
  startDate: string | null,
  endDate: string | null,
  now: Date,
) {
  if (!startDate && !endDate) return null;
  const today = toKSTDateString(now);
  const daysUntil = (date: string) =>
    Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (endDate && endDate < today)
    return { status: "expired", days: null } as const;
  if (startDate && startDate > today)
    return { status: "upcoming", days: daysUntil(startDate) } as const;
  if (!endDate) return { status: "active", days: null } as const;
  const days = daysUntil(endDate);
  return {
    status: days === 0 ? "last-day" : days <= 30 ? "ending" : "active",
    days,
  } as const;
}

/** Display only: attendance eligibility and stored course/booking rules are unchanged. */
export function formatLearningMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`;
}

export function learningLocation(program: LearningSchedule["program"]) {
  const online = program?.location_type === "online";
  return {
    online,
    label: online
      ? "온라인 수업 · 접속 방법은 담당 강사에게 확인해주세요."
      : program?.location_address || "장소는 수업 운영자에게 확인해주세요.",
    mapAddress: online ? null : program?.location_address || null,
  };
}
