import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { BulkStudentResult, BulkStudentRow } from "./student-bulk.ts";

import { normalizePhone } from "./student-fields.ts";
import {
  saveManagedStudent,
  studentSaveFailure,
} from "./student-save.server.ts";

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
      .in(
        "profiles.phone_normalized",
        rows.map((row) => normalizePhone(row.phone)),
      )
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
  const results: BulkStudentResult[] = [];
  const create = async (row: BulkStudentRow): Promise<BulkStudentResult> => {
    try {
      const profileId = await saveManagedStudent(client, organizationId, {
        name: row.name,
        phone: row.phone,
        region: row.region,
        type: row.type,
      });
      return { id: row.id, success: true, profileId };
    } catch (error) {
      console.error("Failed to bulk create student", error);
      return {
        id: row.id,
        success: false,
        error: studentSaveFailure(error).error,
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
