import type { Route } from "./+types/create-schedule";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  createSchedule,
  validateScheduleCreation,
} from "~/features/schedules/queries";
import {
  applyTimeToDate,
  calculateEndTime,
  canStudentRegisterSchedule,
  DURATION_OPTIONS,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  // Get user's organization membership
  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .single();

  if (!membership) {
    return data(
      { success: false, error: "소속된 조직이 없습니다." },
      { status: 400 },
    );
  }

  const organizationId = membership.organization_id;
  const formData = await request.formData();

  const dateStr = formData.get("date") as string;
  const startTimeStr = formData.get("start_time") as string;
  const durationValue = formData.get("duration") as string;
  const programIdStr = formData.get("program_id") as string | null;
  const programId = programIdStr ? parseInt(programIdStr) : null;

  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);

  // Check if student can register for this date
  if (!canStudentRegisterSchedule(date)) {
    return data(
      { success: false, error: "해당 날짜에는 스케쥴을 등록할 수 없습니다." },
      { status: 400 },
    );
  }

  // Get duration hours from form selection (1타임=3시간)
  const selectedDuration = DURATION_OPTIONS.find((opt) => opt.value === durationValue);
  const durationHours = selectedDuration?.hours || 3; // fallback to 3 hours

  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, durationHours);

  // Check if schedule is in the past
  if (startTime < new Date()) {
    return data(
      { success: false, error: "과거 날짜에는 스케쥴을 등록할 수 없습니다." },
      { status: 400 },
    );
  }

  // Validate concurrent limit and student time conflict in a single query
  const { allowed, currentCount, maxCount, hasConflict } = await validateScheduleCreation(
    adminClient,
    {
      organizationId,
      studentId: user.id,
      startTime,
      endTime,
    },
  );

  if (!allowed) {
    return data(
      {
        success: false,
        error: `동시간대 최대 인원(${maxCount}명)을 초과했습니다. 현재 ${currentCount}명 등록됨.`,
      },
      { status: 400 },
    );
  }

  if (hasConflict) {
    return data(
      {
        success: false,
        error: "이미 다른 클래스에 같은 시간대 스케줄이 있습니다.",
      },
      { status: 400 },
    );
  }

  // Create schedule
  await createSchedule(client, {
    organization_id: organizationId,
    student_id: user.id,
    program_id: programId,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
  });

  return data({ success: true });
}
