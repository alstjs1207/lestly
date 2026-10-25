import { toKSTDateString } from "../../schedules/utils/kst.ts";

export const attendanceStatuses = ["PENDING", "PRESENT", "ABSENT"] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];
export const attendanceLabels: Record<AttendanceStatus, string> = {
  PENDING: "미확인",
  PRESENT: "출석",
  ABSENT: "결석 · 예약 취소",
};
export interface AttendanceChange {
  schedule_id: number;
  version: number;
  status: AttendanceStatus;
}

export function parseAttendanceChanges(value: unknown): AttendanceChange[] {
  if (!Array.isArray(value) || !value.length || value.length > 200)
    throw new Error("한 번에 1~200건의 출결을 저장할 수 있습니다.");
  const ids = new Set<number>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isSafeInteger(item.schedule_id) ||
      item.schedule_id < 1 ||
      !Number.isSafeInteger(item.version) ||
      item.version < 0 ||
      item.version > 2147483646 ||
      !attendanceStatuses.includes(item.status) ||
      ids.has(item.schedule_id)
    )
      throw new Error("출결 정보를 확인해 주세요.");
    ids.add(item.schedule_id);
    return {
      schedule_id: item.schedule_id,
      version: item.version,
      status: item.status,
    };
  });
}

export function attendanceDate(value: string | null, now = new Date()): string {
  if (value === null) return toKSTDateString(now);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  )
    throw new Error("날짜를 확인해 주세요.");
  const date = new Date(`${value}T00:00:00+09:00`);
  if (!Number.isFinite(date.getTime()) || toKSTDateString(date) !== value)
    throw new Error("날짜를 확인해 주세요.");
  return value;
}

export function attendanceFailure(error: unknown): {
  status: number;
  error: string;
} {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";
  if (/attendance_not_authorized/.test(message))
    return { status: 403, error: "이 학원의 출결을 처리할 권한이 없습니다." };
  if (/attendance_conflict|attendance_schedule_changed/.test(message))
    return {
      status: 409,
      error:
        "다른 작업에서 예약 또는 출결이 변경되었습니다. 최신 명단을 불러온 뒤 다시 확인해 주세요.",
    };
  if (/attendance_not_started/.test(message))
    return { status: 400, error: "수업 시작 후에 출결을 입력할 수 있습니다." };
  if (/schedule_student_conflict|schedule_capacity_exceeded/.test(message))
    return {
      status: 409,
      error:
        "예약이 겹치거나 정원이 찼습니다. 다른 예약을 확인한 뒤 출결을 정정해 주세요.",
    };
  if (/attendance_invalid_changes/.test(message))
    return { status: 400, error: "저장할 출결 정보를 확인해 주세요." };
  return {
    status: 500,
    error: "출결을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
