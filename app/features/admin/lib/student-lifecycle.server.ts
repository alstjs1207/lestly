import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type StudentChangeImpact = {
  cancel_count: number;
  in_progress: boolean;
  requires_confirmation: boolean;
  token: string;
};

export function parseStudentChangeImpact(
  value: unknown,
): StudentChangeImpact | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.cancel_count) &&
    Number(v.cancel_count) >= 0 &&
    typeof v.token === "string" &&
    /^[a-f0-9]{32}$/.test(v.token) &&
    typeof v.in_progress === "boolean" &&
    typeof v.requires_confirmation === "boolean"
    ? (v as StudentChangeImpact)
    : null;
}

export function studentLifecycleFailure(error: unknown) {
  const e = error as {
    message?: string;
    details?: string;
    code?: string;
  } | null;
  if (e?.code === "P0002")
    return { status: 404, error: "변경할 수강생을 찾을 수 없습니다." };
  if (e?.code === "42501")
    return { status: 403, error: "수강생을 변경할 권한이 없습니다." };
  if (e?.message === "student_change_confirmation_required") {
    let confirmation: StudentChangeImpact | null = null;
    try {
      confirmation = parseStudentChangeImpact(JSON.parse(e.details ?? "null"));
    } catch {
      /* Invalid details fail closed. */
    }
    if (confirmation)
      return {
        status: 409,
        error: `예정 예약 ${confirmation.cancel_count}건이 자동 취소됩니다. 내용을 확인한 뒤 다시 저장해 주세요.`,
        confirmation,
      };
  }
  if (e?.message === "student_lesson_in_progress")
    return {
      status: 409,
      error: "진행 중인 수업이 있습니다. 수업 종료 후 다시 처리해 주세요.",
    };
  if (e?.message === "course_period_shared_profile")
    return {
      status: 409,
      error: "여러 학원에 연결된 수강생의 수강 기간은 별도 확인이 필요합니다.",
    };
  return null;
}

export async function changeStudentState(
  client: SupabaseClient<Database>,
  organizationId: string,
  studentId: string,
  state: "NORMAL" | "GRADUATE" | "DELETED",
  confirmation: string | null,
) {
  const { error } = await client.rpc("set_student_state", {
    p_organization_id: organizationId,
    p_student_id: studentId,
    p_state: state,
    p_confirmation: confirmation,
  });
  if (error) throw error;
}

export async function getStudentStateChangeImpact(
  client: SupabaseClient<Database>,
  organizationId: string,
  studentId: string,
  state: "GRADUATE" | "DELETED",
) {
  const { data: member, error: memberError } = await client
    .from("organization_members")
    .select("profiles!inner(class_end_date)")
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT")
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw { code: "P0002" };
  const { data: impact, error } = await client.rpc(
    "get_student_change_impact",
    {
      p_organization_id: organizationId,
      p_student_id: studentId,
      p_state: state,
      p_end: member.profiles.class_end_date,
    },
  );
  if (error) throw error;
  const parsed = parseStudentChangeImpact(impact);
  if (!parsed) throw new Error("invalid_student_change_impact");
  return parsed;
}
