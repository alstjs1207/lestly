import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  getScheduleById,
  validateScheduleBatch,
} from "~/features/schedules/queries";
import { nowKST, toKST } from "~/features/schedules/utils/kst";
import { shiftScheduleOccurrences } from "~/features/schedules/utils/schedule-validation";
import {
  DURATION_OPTIONS,
  applyTimeToDate,
  calculateEndTime,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const { scheduleId } = params;
  const formData = await request.formData();

  const studentId = formData.get("student_id") as string;
  const programIdStr = formData.get("program_id") as string | null;
  const programId = programIdStr ? parseInt(programIdStr) : null;
  const dateStr = formData.get("date") as string;
  const startTimeStr = formData.get("start_time") as string;
  const durationValue = formData.get("duration") as string;
  const updateScope = formData.get("update_scope") as "single" | "future";

  // Get current schedule
  const currentSchedule = await getScheduleById(client, {
    scheduleId: parseInt(scheduleId),
  });

  // Check if schedule is in the past (compare date only in KST)
  const scheduleKST = toKST(new Date(currentSchedule.start_time));
  const todayKST = nowKST();
  const scheduleValue =
    scheduleKST.year * 10000 + scheduleKST.month * 100 + scheduleKST.day;
  const todayValue =
    todayKST.year * 10000 + todayKST.month * 100 + todayKST.day;
  if (scheduleValue < todayValue) {
    return data(
      { success: false, error: "과거 날짜의 일정은 수정할 수 없습니다." },
      { status: 400 },
    );
  }

  // Get duration hours from form selection (1타임=3시간)
  const selectedDuration = DURATION_OPTIONS.find(
    (opt) => opt.value === durationValue,
  );
  const durationHours = selectedDuration?.hours || 3; // fallback to 3 hours

  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);
  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, durationHours);

  const nextScheduleKST = toKST(startTime);
  const nextScheduleValue =
    nextScheduleKST.year * 10000 +
    nextScheduleKST.month * 100 +
    nextScheduleKST.day;
  if (nextScheduleValue < todayValue) {
    return data(
      { success: false, error: "일정을 과거 날짜로 변경할 수 없습니다." },
      { status: 400 },
    );
  }

  // Verify that the submitted student belongs to the current organization.
  await getStudentById(client, {
    organizationId,
    studentId,
  });

  if (updateScope === "future") {
    const rootScheduleId =
      currentSchedule.parent_schedule_id ?? currentSchedule.schedule_id;
    const { data: seriesSchedules, error: seriesError } = await client
      .from("schedules")
      .select("schedule_id, start_time, end_time")
      .or(
        `schedule_id.eq.${rootScheduleId},parent_schedule_id.eq.${rootScheduleId}`,
      )
      .gte("start_time", currentSchedule.start_time)
      .order("start_time", { ascending: true });

    if (seriesError) {
      return data(
        { success: false, error: seriesError.message },
        { status: 400 },
      );
    }

    const shiftedSchedules = shiftScheduleOccurrences(
      (seriesSchedules ?? []).map((schedule) => ({
        scheduleId: schedule.schedule_id,
        startTime: new Date(schedule.start_time),
        endTime: new Date(schedule.end_time),
      })),
      {
        originalAnchorStart: new Date(currentSchedule.start_time),
        nextAnchorStart: startTime,
        nextAnchorEnd: endTime,
        studentId,
      },
    );

    if (shiftedSchedules.length === 0) {
      return data(
        { success: false, error: "수정할 반복 일정을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const validation = await validateScheduleBatch(client, {
      organizationId,
      candidates: shiftedSchedules,
      excludeScheduleIds: shiftedSchedules.map(
        (schedule) => schedule.scheduleId,
      ),
    });

    if (!validation.allowed) {
      const errorMessage =
        validation.reason === "student_conflict"
          ? "변경하려는 시간에 해당 수강생의 다른 일정이 있습니다."
          : `동시간대 최대 인원(${validation.maxCount}명)을 초과했습니다. 현재 ${validation.currentCount}명 등록됨.`;
      return data({ success: false, error: errorMessage }, { status: 400 });
    }

    const { error: updateError } = await client.rpc(
      "update_admin_schedule_batch",
      {
        p_org: organizationId,
        p_student: studentId,
        p_program: programId,
        p_rows: shiftedSchedules.map((schedule) => ({
          schedule_id: schedule.scheduleId,
          start_time: schedule.startTime.toISOString(),
          end_time: schedule.endTime.toISOString(),
        })),
      },
    );
    if (updateError)
      return data(
        {
          success: false,
          error:
            updateError.message === "schedule_outside_course"
              ? "수강 종료일 이후로 변경할 수 없습니다. 수강 기간을 먼저 확인해 주세요."
              : "일정을 변경하지 못했습니다. 수강 기간과 겹치는 일정을 확인해 주세요.",
        },
        { status: 400 },
      );
  } else {
    const validation = await validateScheduleBatch(client, {
      organizationId,
      candidates: [{ studentId, startTime, endTime }],
      excludeScheduleIds: [parseInt(scheduleId)],
    });

    if (!validation.allowed) {
      const errorMessage =
        validation.reason === "student_conflict"
          ? "변경하려는 시간에 해당 수강생의 다른 일정이 있습니다."
          : `동시간대 최대 인원(${validation.maxCount}명)을 초과했습니다. 현재 ${validation.currentCount}명 등록됨.`;
      return data({ success: false, error: errorMessage }, { status: 400 });
    }

    const { error: updateError } = await client.rpc(
      "update_admin_schedule_batch",
      {
        p_org: organizationId,
        p_student: studentId,
        p_program: programId,
        p_rows: [
          {
            schedule_id: parseInt(scheduleId),
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            is_exception: !!currentSchedule.parent_schedule_id,
          },
        ],
      },
    );
    if (updateError)
      return data(
        {
          success: false,
          error:
            updateError.message === "schedule_outside_course"
              ? "수강 종료일 이후로 변경할 수 없습니다. 수강 기간을 먼저 확인해 주세요."
              : "일정을 변경하지 못했습니다. 수강 기간과 겹치는 일정을 확인해 주세요.",
        },
        { status: 400 },
      );
  }

  return redirect("/admin/schedules");
}
