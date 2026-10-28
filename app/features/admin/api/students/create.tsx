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
import {
  addYearsToDateString,
  getDefaultStudentClassDates,
} from "../../lib/student-class-dates";
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
  const parsed = parseStudentForm(formData, studentTypes);
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
  const defaultClassDates = getDefaultStudentClassDates();
  const classStartDate =
    values.class_start_date || defaultClassDates.classStartDate;
  const classEndDate =
    values.class_end_date || addYearsToDateString(classStartDate);
  if (classEndDate < classStartDate) {
    return data(
      {
        success: false,
        fieldErrors: {
          class_end_date: ["수업 종료일은 시작일 이후여야 합니다."],
        },
      },
      { status: 400 },
    );
  }

  try {
    const profileId = await saveManagedStudent(client, organizationId, {
      ...values,
      class_start_date: classStartDate,
      class_end_date: classEndDate,
    });
    return redirect(`/admin/students/${profileId}`);
  } catch (error) {
    console.error("Failed to create student", error);
    const { status, ...failure } = studentSaveFailure(error);
    return data({ success: false, ...failure }, { status });
  }
}
