import type { Route } from "./+types/create-schedule";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { dispatchSchedulePush } from "~/features/notifications/push/dispatch.server";
import {
  applyTimeToDate,
  calculateEndTime,
  canStudentRegisterSchedule,
  parseDateString,
} from "~/features/schedules/utils/student-schedule-rules";

import {
  bookingStartTimes,
  submittedDuration,
} from "../../app-settings/booking-policy";
import { getBookingPolicy } from "../../app-settings/booking-policy.server";
import {
  canCancelWithPolicy,
  cancellationPolicySchema,
  sameCancellationPolicy,
} from "../../app-settings/cancellation-policy";
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
  const policy = await getBookingPolicy(client, { organizationId });
  let minutes: number;
  try {
    minutes = submittedDuration(formData, policy);
  } catch {
    return data(
      { success: false, error: "허용된 수업 길이를 선택해주세요." },
      { status: 400, headers },
    );
  }
  const programIdStr = formData.get("program_id") as string | null;
  const programId = programIdStr ? parseInt(programIdStr) : null;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "") ||
    !bookingStartTimes(policy).includes(startTimeStr) ||
    (programIdStr && !/^[1-9]\d*$/.test(programIdStr))
  ) {
    return data(
      { success: false, error: "날짜와 시간을 확인해주세요." },
      { status: 400, headers },
    );
  }
  // Parse date and time (use parseDateString to avoid UTC timezone issue)
  const date = parseDateString(dateStr);
  const now = new Date();

  // Check if student can register for this date
  if (
    toKSTDateString(date) !== dateStr ||
    !canStudentRegisterSchedule(date, policy, now)
  ) {
    return data(
      { success: false, error: "해당 날짜에는 스케쥴을 등록할 수 없습니다." },
      { status: 400 },
    );
  }

  const startTime = applyTimeToDate(date, startTimeStr);
  const endTime = calculateEndTime(startTime, minutes / 60);

  // Check if schedule is in the past
  if (startTime <= now || +startTime < +now + policy.leadMinutes * 60_000) {
    return data(
      {
        success: false,
        error: "예약 접수가 마감됐거나 이미 지난 시작 시각입니다.",
      },
      { status: 400 },
    );
  }

  let expectedPolicy;
  try {
    expectedPolicy = cancellationPolicySchema.parse(
      JSON.parse(String(formData.get("cancellation_policy"))),
    );
  } catch {
    return data(
      {
        success: false,
        error: "취소 정책을 확인할 수 없어요. 예약 화면을 새로 불러와 주세요.",
      },
      { status: 409, headers },
    );
  }
  if (!sameCancellationPolicy(expectedPolicy, policy.cancellationPolicy))
    return data(
      {
        success: false,
        error: "취소 정책이 변경됐어요. 예약 화면에서 다시 확인해주세요.",
      },
      { status: 409, headers },
    );
  const acceptNoCancellation = formData.get("accept_no_cancellation") === "1";
  if (
    !canCancelWithPolicy(startTime, policy.cancellationPolicy, now) &&
    !acceptNoCancellation
  )
    return data(
      {
        success: false,
        error:
          "취소 기한이 지난 수업이에요. 예약 후 직접 취소할 수 없다는 안내를 확인해주세요.",
      },
      { status: 400, headers },
    );

  const { data: scheduleId, error } = await client.rpc(
    "book_student_schedule_with_policy",
    {
      p_organization_id: organizationId,
      p_program_id: programId,
      p_start_time: startTime.toISOString(),
      p_end_time: endTime.toISOString(),
      p_expected_cancellation_policy: expectedPolicy,
      p_accept_no_cancellation: acceptNoCancellation,
    },
  );
  if (error) {
    const errors: Record<string, string> = {
      schedule_cancellation_policy_changed:
        "취소 정책이 변경됐어요. 시간을 다시 선택하고 취소 안내를 확인해주세요.",
      schedule_cancellation_ack_required:
        "취소 기한이 지났어요. 시간을 다시 선택하고 직접 취소 불가 안내를 확인해주세요.",
      schedule_booking_closed:
        "예약 접수가 마감됐습니다. 다른 시간을 선택해주세요.",
      schedule_date_not_allowed:
        "예약 가능한 날짜와 시작 시각을 다시 확인해주세요.",
      schedule_time_disabled:
        "이 시작 시간은 현재 신청할 수 없습니다. 다른 시간을 선택해주세요.",
      schedule_day_disabled:
        "이 요일은 휴무일로 신규 예약을 받지 않습니다. 다른 날짜를 선택해주세요.",
      schedule_time_not_allowed:
        "조직의 수업 길이와 시작 시간 설정이 변경됐습니다. 시간을 다시 선택해주세요.",
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

  if (scheduleId) await dispatchSchedulePush(scheduleId, profile.profile_id);
  return data({ success: true }, { headers });
}
