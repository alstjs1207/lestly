import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import { parseStudentForm } from "../../lib/student-form.server";
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

  try {
    await saveManagedStudent(
      client,
      organizationId,
      {
        ...values,
        lifecycle_confirmation: String(
          formData.get("lifecycle_confirmation") ?? "",
        ),
      },
      studentId,
    );
    return redirect(`/admin/students/${studentId}`);
  } catch (error) {
    console.error("Failed to update student", error);
    const { status, ...failure } = studentSaveFailure(error);
    return data({ success: false, ...failure }, { status });
  }
}
