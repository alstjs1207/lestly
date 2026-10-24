import type { Route } from "./+types/delete-schedule";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import { dispatchSchedulePush } from "~/features/notifications/push/dispatch.server";
import { canStudentCancelSchedule } from "~/features/schedules/utils/student-schedule-rules";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const user = await getSessionUser(client);
  if (!user) throw redirect("/login");
  const id = Number(params.scheduleId);
  if (!/^[1-9]\d*$/.test(params.scheduleId) || !Number.isSafeInteger(id))
    return data(
      { success: false, error: "취소할 수업을 확인해주세요." },
      { status: 400, headers },
    );
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("profile_id")
    .eq("auth_user_id", user.id)
    .single();
  if (profileError || !profile)
    return data(
      { success: false, error: "수강생 프로필을 확인할 수 없어요." },
      { status: 403, headers },
    );
  const { data: schedule, error: readError } = await client
    .from("schedules")
    .select("schedule_id,start_time")
    .eq("schedule_id", id)
    .eq("student_id", profile.profile_id)
    .maybeSingle();
  if (readError)
    return data(
      {
        success: false,
        error: "수업 정보를 확인하지 못했어요. 다시 시도해주세요.",
      },
      { status: 400, headers },
    );
  if (!schedule)
    return data(
      {
        success: false,
        error:
          "이미 취소되었거나 조회할 수 없는 수업이에요. 일정을 새로고침해주세요.",
      },
      { status: 404, headers },
    );
  if (!canStudentCancelSchedule(new Date(schedule.start_time)))
    return data(
      {
        success: false,
        error:
          "당일·지난 수업은 취소할 수 없어요. 변경이 필요하면 학원에 문의해주세요.",
      },
      { status: 400, headers },
    );
  // RLS checks the KST cancellation deadline again at the actual DELETE.
  const { data: deleted, error: deleteError } = await client
    .from("schedules")
    .delete()
    .eq("schedule_id", id)
    .eq("student_id", profile.profile_id)
    .select("schedule_id")
    .maybeSingle();
  if (deleteError || !deleted)
    return data(
      {
        success: false,
        error:
          "수업을 취소하지 못했어요. 취소 가능 기한과 일정을 다시 확인해주세요.",
      },
      { status: 400, headers },
    );
  await dispatchSchedulePush(deleted.schedule_id, profile.profile_id);
  return data({ success: true }, { headers });
}
