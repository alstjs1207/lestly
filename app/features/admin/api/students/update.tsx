import type { Route } from "./+types/update";

import { data, redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

import { getStudentTypes } from "../../../organizations/student-types.server";
import { requireAdminRole } from "../../guards.server";
import { parseStudentForm } from "../../lib/student-form.server";
import {
  saveManagedStudent,
  studentSaveFailure,
} from "../../lib/student-save.server";
import { getStudentById } from "../../queries";

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();
  const { studentId } = params;
  const [studentTypes, current] = await Promise.all([
    getStudentTypes(client, organizationId),
    getStudentById(client, { organizationId, studentId }),
  ]);
  const parsed = parseStudentForm(formData, studentTypes, current.type);
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
