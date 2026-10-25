import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { StudentFormValues } from "./student-form.server.ts";

import {
  addYearsToDateString,
  getDefaultStudentClassDates,
} from "./student-class-dates.ts";
import { studentLifecycleFailure } from "./student-lifecycle.server.ts";

export async function saveManagedStudent(
  client: SupabaseClient<Database>,
  organizationId: string,
  values: Pick<StudentFormValues, "name" | "phone" | "region" | "type"> &
    Partial<StudentFormValues> & {
      lifecycle_confirmation?: string;
    },
  studentId?: string,
) {
  const payload = { ...values };
  if (!studentId) {
    payload.class_start_date ||= getDefaultStudentClassDates().classStartDate;
    payload.class_end_date ||= addYearsToDateString(payload.class_start_date);
  }
  const { data, error } = await client.rpc("save_managed_student", {
    p_organization_id: organizationId,
    p_values: payload,
    ...(studentId ? { p_student_id: studentId } : {}),
  });
  if (error) throw error;
  if (!data) throw new Error("Missing saved student ID");
  return data;
}

export function studentSaveFailure(error: unknown) {
  const lifecycle = studentLifecycleFailure(error);
  if (lifecycle) return lifecycle;
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "23505") {
    return {
      status: 409,
      error: "동일한 전화번호의 수강생이 이미 등록되어 있습니다.",
      fieldErrors: {
        phone: ["동일한 전화번호의 수강생이 이미 등록되어 있습니다."],
      },
    };
  }
  if (code === "P0002")
    return { status: 404, error: "수정할 수강생을 찾을 수 없습니다." };
  if (code === "42501")
    return { status: 403, error: "수강생을 저장할 권한이 없습니다." };
  return {
    status: 500,
    error:
      "수강생 정보를 저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.",
  };
}
