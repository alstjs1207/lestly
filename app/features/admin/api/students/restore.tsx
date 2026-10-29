import type { Route } from "./+types/restore";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import {
  changeStudentState,
  studentLifecycleFailure,
} from "../../lib/student-lifecycle.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  try {
    await changeStudentState(
      client,
      organizationId,
      params.studentId,
      "NORMAL",
      null,
    );
  } catch (error) {
    const failure = studentLifecycleFailure(error);
    return data(
      {
        success: false,
        error:
          failure?.error ??
          "수강 재개를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: failure?.status ?? 500, headers },
    );
  }
  return redirect(`/admin/students/${params.studentId}`, { headers });
}
