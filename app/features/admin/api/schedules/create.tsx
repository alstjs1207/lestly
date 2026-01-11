import type { Route } from "./+types/create";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  checkConcurrentLimit,
  createSchedule,
  createSchedules,
} from "~/features/schedules/queries";
import {
  applyTimeToDate,
  calculateEndTime,
  DURATION_OPTIONS,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";
import { generateWeeklyDates } from "~/features/schedules/utils/rrule-helper";

import { requireAdminRole } from "../../guards.server";
import { getStudentById } from "../../queries";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const studentId = formData.get("student_id") as string;
  const programIdStr = formData.get("program_id") as string | null;
  const programId = programIdStr ? parseInt(programIdStr) : null;
  const dateStr = formData.get("date") as string;
  const startTimeStr = formData.get("start_time") as string;
  const durationValue = formData.get("duration") as string;
  const isRecurring = formData.get("is_recurring") === "true";

  // Get duration hours from form selection (1타임=3시간)
  const selectedDuration = DURATION_OPTIONS.find((opt) => opt.value === durationValue);
  const durationHours = selectedDuration?.hours || 3; // fallback to 3 hours

  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);
  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, durationHours);

  // Check concurrent limit
  const { allowed, currentCount, maxCount } = await checkConcurrentLimit(client, {
    organizationId,
    startTime,
    endTime,
  });

  if (!allowed) {
    throw new Error(
      `동시간대 최대 인원(${maxCount}명)을 초과했습니다. 현재 ${currentCount}명 등록됨.`,
    );
  }

  if (isRecurring) {
    // Get student's class end date for recurring schedules
    const student = await getStudentById(client, { organizationId, studentId });
    if (!student.class_end_date) {
      throw new Error("수강생의 수업 종료일이 설정되어 있지 않습니다.");
    }

    const endDate = new Date(student.class_end_date);
    const weeklyDates = generateWeeklyDates(startTime, endDate);

    // Create main schedule
    const mainSchedule = await createSchedule(client, {
      organization_id: organizationId,
      student_id: studentId,
      program_id: programId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      rrule: `FREQ=WEEKLY;UNTIL=${endDate.toISOString()}`,
    });

    // Create recurring instances
    if (weeklyDates.length > 1) {
      const recurringSchedules = weeklyDates.slice(1).map((recurDate) => {
        const recurStartTime = applyTimeToDate(recurDate, startTimeStr);
        const recurEndTime = calculateEndTime(recurStartTime, durationHours);
        return {
          organization_id: organizationId,
          student_id: studentId,
          program_id: programId,
          start_time: recurStartTime.toISOString(),
          end_time: recurEndTime.toISOString(),
          parent_schedule_id: mainSchedule.schedule_id,
        };
      });

      await createSchedules(client, recurringSchedules);
    }
  } else {
    // Create single schedule
    await createSchedule(client, {
      organization_id: organizationId,
      student_id: studentId,
      program_id: programId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
  }

  return redirect("/admin/schedules");
}
