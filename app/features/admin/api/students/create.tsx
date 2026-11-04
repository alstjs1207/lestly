/**
 * Student Creation API
 *
 * Creates a management profile and organization membership. Authentication is
 * connected later only when the administrator creates an invitation link.
 */
import type { Route } from "./+types/create";

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

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);

  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const formData = await request.formData();

  const studentTypes = await getStudentTypes(client, organizationId);
  const parsed = parseStudentForm(formData, studentTypes, undefined, {
    creating: true,
  });
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
    const profileId = await saveManagedStudent(client, organizationId, values);
    return redirect(`/admin/students/${profileId}`);
  } catch (error) {
    console.error("Failed to create student", error);
    const { status, ...failure } = studentSaveFailure(error);
    return data({ success: false, ...failure }, { status });
  }
}
