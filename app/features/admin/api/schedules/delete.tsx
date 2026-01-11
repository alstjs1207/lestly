import type { Route } from "./+types/delete";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  deleteSchedule,
  deleteFutureSchedules,
  getScheduleById,
} from "~/features/schedules/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const { scheduleId } = params;
  const formData = await request.formData();
  const deleteScope = formData.get("delete_scope") as "single" | "future";

  // Get current schedule
  const currentSchedule = await getScheduleById(client, {
    scheduleId: parseInt(scheduleId),
  });

  // Check if schedule is in the past
  if (new Date(currentSchedule.start_time) < new Date()) {
    throw new Error("과거 날짜의 일정은 삭제할 수 없습니다.");
  }

  if (deleteScope === "future" && currentSchedule.parent_schedule_id) {
    // Delete all future schedules in the series
    await deleteFutureSchedules(client, {
      parentScheduleId: currentSchedule.parent_schedule_id,
      fromDate: new Date(currentSchedule.start_time),
    });
  } else {
    // Delete single schedule
    await deleteSchedule(client, { scheduleId: parseInt(scheduleId) });
  }

  return redirect("/admin/schedules");
}
