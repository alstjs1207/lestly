import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

// JSONB 필드 타입 정의
export interface CurriculumItem {
  session: number;
  title: string;
  description?: string;
}

export interface InstructorSns {
  instagram?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

/**
 * slug로 공개 프로그램 조회 (instructor 포함)
 */
export async function getPublicProgramBySlug(
  client: SupabaseClient<Database>,
  { slug }: { slug: string },
) {
  const { data, error } = await client
    .from("programs")
    .select(
      `
      *,
      instructor:instructors!programs_instructor_id_instructors_instructor_id_fk(*)
    `,
    )
    .eq("slug", slug)
    .eq("is_public", true)
    .eq("status", "ACTIVE")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
