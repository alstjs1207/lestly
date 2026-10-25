import type { Route } from "./+types/graduate";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import {
  changeStudentState,
  getStudentStateChangeImpact,
  studentLifecycleFailure,
} from "../../lib/student-lifecycle.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  headers.set("Cache-Control", "private, no-store");
  try {
    const impact = await getStudentStateChangeImpact(
      client,
      organizationId,
      params.studentId,
      "GRADUATE",
    );
    return data({ impact }, { headers });
  } catch (error) {
    const failure = studentLifecycleFailure(error);
    return data(
      {
        error:
          failure?.error ??
          "예약 정보를 조회하지 못했습니다. 다시 시도해 주세요.",
      },
      { status: failure?.status ?? 500, headers },
    );
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const form = await request.formData();
  try {
    await changeStudentState(
      client,
      organizationId,
      params.studentId,
      "GRADUATE",
      String(form.get("lifecycle_confirmation") ?? "") || null,
    );
  } catch (error) {
    const failure = studentLifecycleFailure(error);
    if (failure)
      return data(
        { success: false, ...failure },
        { status: failure.status, headers },
      );
    return data(
      {
        success: false,
        error: "수강생 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }
  return redirect("/admin/students", { headers });
}
