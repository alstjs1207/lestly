import type { Route } from "./+types/create";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { validateScheduleBatch } from "~/features/schedules/queries";
import { fromKST, toKSTDateString } from "~/features/schedules/utils/kst";
import { generateWeeklyDates } from "~/features/schedules/utils/rrule-helper";
import {
  applyTimeToDate,
  calculateEndTime,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

import { submittedDuration } from "../../../app-settings/booking-policy";
import { getProgramBookingPolicy } from "../../../programs/booking-policy.server";
import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const studentIds = Array.from(
    new Set(formData.getAll("student_ids") as string[]),
  );
  // Fallback for edit mode (single student_id)
  if (studentIds.length === 0) {
    const singleId = formData.get("student_id") as string;
    if (singleId) studentIds.push(singleId);
  }

  if (studentIds.length === 0) {
    return data(
      { success: false, error: "수강생을 1명 이상 선택해주세요." },
      { status: 400 },
    );
  }

  const programIdStr = formData.get("program_id") as string | null;
  const programId =
    programIdStr && /^[1-9]\d*$/.test(programIdStr) ? Number(programIdStr) : 0;
  const dateStr = formData.get("date") as string;
  const startTimeStr = formData.get("start_time") as string;
  let bookingPolicy;
  try {
    ({ policy: bookingPolicy } = await getProgramBookingPolicy(client, {
      organizationId,
      programId,
    }));
  } catch (error) {
    if (
      !["schedule_program_required", "schedule_program_not_eligible"].includes(
        (error as Error).message,
      )
    )
      throw error;
    return data(
      { success: false, error: "예약할 활성 클래스를 선택해 주세요." },
      { status: 400 },
    );
  }
  const isRecurring = formData.get("is_recurring") === "true";

  let durationMinutes: number;
  try {
    durationMinutes = submittedDuration(formData, bookingPolicy, undefined);
  } catch {
    return data(
      { success: false, error: "허용된 수업 길이를 선택해 주세요." },
      { status: 400 },
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTimeStr ?? "")
  )
    return data(
      { success: false, error: "날짜와 시간을 확인해 주세요." },
      { status: 400 },
    );
  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);
  const startTime = applyTimeToDate(date, startTimeStr);
  if (toKSTDateString(startTime) !== dateStr)
    return data(
      { success: false, error: "날짜를 확인해 주세요." },
      { status: 400 },
    );

  const errors: string[] = [];

  for (const studentId of studentIds) {
    try {
      // This also verifies that the selected student belongs to the admin's org.
      const student = await getStudentById(client, {
        organizationId,
        studentId,
      });

      let occurrenceStarts = [startTime];
      let recurrenceEndDate: Date | null = null;

      if (isRecurring) {
        // Get student's class end date for recurring schedules
        if (!student.class_end_date) {
          errors.push(`${student.name}: 수업 종료일이 설정되어 있지 않습니다.`);
          continue;
        }

        const [ey, em, ed] = student.class_end_date.split("-").map(Number);
        const endDate = fromKST(ey, em - 1, ed, 23, 59, 59);
        occurrenceStarts = generateWeeklyDates(startTime, endDate);
        recurrenceEndDate = endDate;

        if (occurrenceStarts.length === 0) {
          errors.push(
            `${student.name}: 수업 종료일 이후에는 반복 일정을 등록할 수 없습니다.`,
          );
          continue;
        }
      }

      const candidates = occurrenceStarts.map((occurrenceStart) => ({
        studentId,
        startTime: occurrenceStart,
        endTime: calculateEndTime(occurrenceStart, durationMinutes / 60),
      }));

      // Validate every occurrence before inserting any row for this student.
      const validation = await validateScheduleBatch(client, {
        organizationId,
        programId,
        candidates,
      });

      if (!validation.allowed) {
        const conflictDate = validation.candidate
          ? toKSTDateString(validation.candidate.startTime)
          : dateStr;

        if (validation.reason === "student_conflict") {
          errors.push(
            `${student.name}: ${conflictDate}에 이미 겹치는 일정이 있습니다.`,
          );
        } else if (validation.reason === "capacity") {
          errors.push(
            `${student.name}: ${conflictDate} 동시간대 최대 인원(${validation.maxCount}명) 초과 (현재 ${validation.currentCount}명)`,
          );
        } else {
          errors.push(`${student.name}: 올바르지 않은 일정 시간입니다.`);
        }
        continue;
      }

      const { error: saveError } = await client.rpc(
        "create_admin_schedule_series",
        {
          p_org: organizationId,
          p_student: studentId,
          p_program: programId,
          p_rows: candidates.map((candidate) => ({
            start_time: candidate.startTime.toISOString(),
            end_time: candidate.endTime.toISOString(),
          })),
          p_rrule:
            isRecurring && recurrenceEndDate
              ? `FREQ=WEEKLY;UNTIL=${recurrenceEndDate.toISOString()}`
              : null,
        },
      );
      if (saveError) throw saveError;
    } catch (e) {
      const student = await getStudentById(client, {
        organizationId,
        studentId,
      }).catch(() => null);
      const name = student?.name || studentId;
      const message =
        e && typeof e === "object" && "message" in e ? String(e.message) : "";
      errors.push(
        message === "schedule_outside_course"
          ? `${name}: 수강 기간을 벗어나는 수업은 등록할 수 없습니다. 수강 기간을 먼저 확인해 주세요.`
          : `${name}: 등록 중 오류가 발생했습니다.`,
      );
    }
  }

  if (errors.length > 0 && errors.length === studentIds.length) {
    // All failed
    return data({ success: false, error: errors.join("\n") }, { status: 400 });
  }

  if (errors.length > 0) {
    // Partial failure - some succeeded, redirect with warning
    // For now, still redirect since some were created successfully
    return redirect("/admin/schedules");
  }

  return redirect("/admin/schedules");
}
