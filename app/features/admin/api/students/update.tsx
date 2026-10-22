import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import {
  parseStudentForm,
  parseStudentState,
} from "../../lib/student-form.server";
import {
  saveManagedStudent,
  studentSaveFailure,
} from "../../lib/student-save.server";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();
  const { studentId } = params;
  const parsed = parseStudentForm(formData);
  if (!parsed.success) {
    return data(
      {
        success: false,
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const values = parsed.data;
  const parsedState = parseStudentState(formData.get("state"));
  if (!parsedState.success) {
    return data(
      {
        success: false,
        fieldErrors: { state: ["수강생 상태를 선택해 주세요."] },
      },
      { status: 400 },
    );
  }

  try {
    await saveManagedStudent(
      client,
      organizationId,
      { ...values, state: parsedState.data },
      studentId,
    );
    return redirect(`/admin/students/${studentId}`);
  } catch (error) {
    console.error("Failed to update student", error);
    const { status, ...failure } = studentSaveFailure(error);
    return data({ success: false, ...failure }, { status });
  }
}
