import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { BulkStudentResult, BulkStudentRow } from "./student-bulk.ts";

import { getDefaultStudentClassDates } from "./student-class-dates.ts";
import { normalizePhone } from "./student-fields.ts";

export async function findBulkStudentDuplicates(
  client: SupabaseClient<Database>,
  organizationId: string,
  rows: BulkStudentRow[],
): Promise<BulkStudentResult[]> {
  const phones = new Map<string, string>();
  // Include graduates and deleted students, matching individual registration.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("organization_members")
      .select("profile_id, profiles!inner(name, phone)")
      .eq("organization_id", organizationId)
      .eq("role", "STUDENT")
      .order("profile_id")
      .range(offset, offset + 999);
    if (error) throw error;
    for (const member of data ?? []) {
      if (member.profiles.phone)
        phones.set(normalizePhone(member.profiles.phone), member.profiles.name);
    }
    if (!data || data.length < 1000) break;
  }
  return rows.flatMap((row) => {
    const name = phones.get(normalizePhone(row.phone));
    return name === undefined
      ? []
      : [
          {
            id: row.id,
            success: false,
            error: `동일한 전화번호로 수강생 '${name}'님이 이미 등록되어 있습니다.`,
          },
        ];
  });
}

export async function createBulkStudents(
  client: SupabaseClient<Database>,
  organizationId: string,
  rows: BulkStudentRow[],
): Promise<BulkStudentResult[]> {
  const dates = getDefaultStudentClassDates();
  const results: BulkStudentResult[] = [];
  const create = async (row: BulkStudentRow): Promise<BulkStudentResult> => {
    const profileId = crypto.randomUUID();
    let profileCreated = false;
    try {
      const profile = await client.from("profiles").insert({
        profile_id: profileId,
        auth_user_id: null,
        contact_email: null,
        name: row.name,
        phone: row.phone,
        region: row.region,
        class_start_date: dates.classStartDate,
        class_end_date: dates.classEndDate,
        color: "#3B82F6",
        marketing_consent: false,
      });
      if (profile.error) throw profile.error;
      profileCreated = true;
      const membership = await client.from("organization_members").insert({
        organization_id: organizationId,
        profile_id: profileId,
        role: "STUDENT",
        state: "NORMAL",
        type: row.type,
      });
      if (membership.error) throw membership.error;
      return { id: row.id, success: true };
    } catch (error) {
      console.error("Failed to bulk create student", error);
      if (profileCreated) {
        try {
          const cleanup = await client
            .from("profiles")
            .delete()
            .eq("profile_id", profileId);
          if (cleanup.error) throw cleanup.error;
        } catch (cleanupError) {
          console.error(
            "Failed to remove incomplete bulk student profile",
            profileId,
            cleanupError,
          );
          return {
            id: row.id,
            success: false,
            error:
              "저장 중 오류가 발생했습니다. 관리자에게 등록 상태 확인을 요청해 주세요.",
          };
        }
      }
      return {
        id: row.id,
        success: false,
        error: "저장하지 못했습니다. 다시 시도해 주세요.",
      };
    }
  };
  // Bound concurrent requests while allowing failed rows to be retried separately.
  for (let offset = 0; offset < rows.length; offset += 5) {
    results.push(
      ...(await Promise.all(rows.slice(offset, offset + 5).map(create))),
    );
  }
  return results;
}
