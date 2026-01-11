import type { Route } from "./+types/update";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  checkConcurrentLimit,
  getScheduleById,
  updateSchedule,
} from "~/features/schedules/queries";
import {
  applyTimeToDate,
  calculateEndTime,
  DURATION_OPTIONS,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

import { requireAdminRole } from "../../guards.server";

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

  // Check if schedule is in the past (compare date only, not time)
  const scheduleDate = new Date(currentSchedule.start_time);
  const today = new Date();
  scheduleDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  if (scheduleDate < today) {
    throw new Error("과거 날짜의 일정은 수정할 수 없습니다.");
  }

  // Get duration hours from form selection (1타임=3시간)
  const selectedDuration = DURATION_OPTIONS.find((opt) => opt.value === durationValue);
  const durationHours = selectedDuration?.hours || 3; // fallback to 3 hours

  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);
  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, durationHours);

  // Check concurrent limit (excluding current schedule)
  const { allowed, currentCount, maxCount } = await checkConcurrentLimit(client, {
    organizationId,
    startTime,
    endTime,
    excludeScheduleId: parseInt(scheduleId),
  });

  if (!allowed) {
    throw new Error(
      `동시간대 최대 인원(${maxCount}명)을 초과했습니다. 현재 ${currentCount}명 등록됨.`,
    );
  }

  if (updateScope === "future" && currentSchedule.parent_schedule_id) {
    // Update all future schedules in the series
    const { error } = await client
      .from("schedules")
      .update({
        student_id: studentId,
        program_id: programId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
      })
      .eq("parent_schedule_id", currentSchedule.parent_schedule_id)
      .gte("start_time", new Date().toISOString());

    if (error) {
      throw new Error(error.message);
    }
  } else {
    // Update single schedule
    await updateSchedule(client, {
      scheduleId: parseInt(scheduleId),
      updates: {
        student_id: studentId,
        program_id: programId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        is_exception: !!currentSchedule.parent_schedule_id,
      },
    });
  }

  return redirect("/admin/schedules");
}
