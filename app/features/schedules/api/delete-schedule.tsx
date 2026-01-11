import type { Route } from "./+types/delete-schedule";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { deleteSchedule, getScheduleById } from "~/features/schedules/queries";
import { canStudentCancelSchedule } from "~/features/schedules/utils/student-schedule-rules";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  const { scheduleId } = params;

  // Get schedule
  const schedule = await getScheduleById(client, {
    scheduleId: parseInt(scheduleId),
  });

  // Check if user owns this schedule
  if (schedule.student_id !== user.id) {
    throw new Error("이 스케쥴을 취소할 권한이 없습니다.");
  }

  // Check if schedule can be cancelled
  if (!canStudentCancelSchedule(new Date(schedule.start_time))) {
    throw new Error(
      "당일 스케쥴은 취소할 수 없습니다. 강사에게 문의해주세요.",
    );
  }

  // Delete schedule
  await deleteSchedule(client, { scheduleId: parseInt(scheduleId) });

  return redirect("/my-schedules");
}
