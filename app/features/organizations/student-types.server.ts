import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { StudentTypeOption } from "./student-types.ts";

export async function getStudentTypes(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<StudentTypeOption[]> {
  const { data, error } = await client
    .from("organization_student_types")
    .select("code,label,sort_order,is_active,is_default")
    .eq("organization_id", organizationId)
    .order("sort_order")
    .order("code");
  if (error) throw error;
  if (!data?.length) throw new Error("수강생 유형 설정을 불러오지 못했습니다.");
  return data;
}
