import type { Route } from "./+types/create-schedule";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  DURATION_OPTIONS,
  applyTimeToDate,
  calculateEndTime,
  canStudentRegisterSchedule,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

import { toKSTDateString } from "../utils/kst";

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client, headers] = makeServerClient(request);

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  const { data: profile } = await client
    .from("profiles")
    .select("profile_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return data(
      { success: false, error: "수강생 프로필을 찾을 수 없습니다." },
      { status: 400 },
    );
  }

  // Get user's organization membership
  const { data: membership } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profile.profile_id)
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

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "") ||
    !/^(09|1\d|20):(00|30)$/.test(startTimeStr || "") ||
    !DURATION_OPTIONS.some((option) => option.value === durationValue) ||
    (programIdStr && !/^[1-9]\d*$/.test(programIdStr))
  ) {
    return data(
      { success: false, error: "날짜와 시간을 확인해주세요." },
      { status: 400, headers },
    );
  }
  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);

  // Check if student can register for this date
  if (toKSTDateString(date) !== dateStr || !canStudentRegisterSchedule(date)) {
    return data(
      { success: false, error: "해당 날짜에는 스케쥴을 등록할 수 없습니다." },
      { status: 400 },
    );
  }

  // Get duration hours from form selection (1타임=3시간)
  const selectedDuration = DURATION_OPTIONS.find(
    (opt) => opt.value === durationValue,
  );
  const durationHours = selectedDuration?.hours || 3; // fallback to 3 hours

  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, durationHours);

  // Check if schedule is in the past
  if (startTime <= new Date()) {
    return data(
      { success: false, error: "과거 날짜에는 스케쥴을 등록할 수 없습니다." },
      { status: 400 },
    );
  }

  const { error } = await client.rpc("book_student_schedule", {
    p_organization_id: organizationId,
    p_program_id: programId,
    p_start_time: startTime.toISOString(),
    p_end_time: endTime.toISOString(),
  });
  if (error) {
    const errors: Record<string, string> = {
      schedule_date_not_allowed:
        "예약 가능한 날짜와 시작 시각을 다시 확인해주세요.",
      schedule_time_not_allowed:
        "시작 시간은 09:00~20:00, 수업 시간은 3·6·9시간 중 선택해주세요.",
      schedule_student_conflict: "이미 같은 시간대에 등록한 일정이 있습니다.",
      schedule_capacity_exceeded: "동시간대 정원이 찼습니다.",
      schedule_outside_course: "수강 기간에 포함된 날짜를 선택해주세요.",
      schedule_program_not_eligible: "선택한 클래스를 등록할 수 없습니다.",
    };
    return data(
      {
        success: false,
        error:
          errors[error.message] || "등록 가능한 날짜와 시간을 확인해주세요.",
      },
      { status: 400, headers },
    );
  }

  return data({ success: true }, { headers });
}
