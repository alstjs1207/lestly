import type { Route } from "./+types/delete";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  deleteFutureSchedules,
  deleteSchedule,
  getScheduleById,
} from "~/features/schedules/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const { scheduleId } = params;
  const formData = await request.formData();
  const deleteScope = formData.get("delete_scope") as "single" | "future";

  // Get current schedule
  try {
    const currentSchedule = await getScheduleById(client, {
      scheduleId: parseInt(scheduleId),
    });

    // Check if schedule is in the past
    if (new Date(currentSchedule.start_time) < new Date()) {
      return data(
        { success: false, error: "과거 날짜의 일정은 삭제할 수 없습니다." },
        { status: 400 },
      );
    }

    if (deleteScope === "future") {
      // Delete all future schedules in the series
      await deleteFutureSchedules(client, {
        parentScheduleId:
          currentSchedule.parent_schedule_id ?? currentSchedule.schedule_id,
        fromDate: new Date(currentSchedule.start_time),
        studentId: currentSchedule.student_id,
        organizationId,
      });
    } else {
      // Delete single schedule
      await deleteSchedule(client, { scheduleId: parseInt(scheduleId) });
    }
  } catch (error) {
    console.error("Failed to delete schedule", error);
    return data(
      {
        success: false,
        error: "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }

  return redirect("/admin/schedules");
}
