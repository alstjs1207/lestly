/**
 * Program Delete API
 *
 * Deletes a program if it has no schedules.
 */
import type { Route } from "./+types/delete";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { deleteProgram, hasSchedules } from "~/features/programs/queries";

import { requireAdminRole } from "../../guards.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  await requireAdminRole(client);

  const programId = parseInt(params.programId);

  try {
    // Check if program has any schedules
    const programHasSchedules = await hasSchedules(client, { programId });

    if (programHasSchedules) {
      return data(
        {
          success: false,
          error: "스케줄이 존재하는 클래스는 삭제할 수 없습니다.",
        },
        { status: 400 },
      );
    }

    await deleteProgram(client, { programId });
  } catch (error) {
    if ((error as { code?: string })?.code === "23503")
      return data(
        {
          success: false,
          error:
            "예약이 있는 클래스는 삭제할 수 없습니다. 보관 상태로 변경해 주세요.",
        },
        { status: 409 },
      );
    console.error("Failed to delete program", error);
    return data(
      {
        success: false,
        error: "클래스를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }

  return redirect("/admin/programs");
}
