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
  { slug }: { slug: string }
) {
  const { data, error } = await client
    .from("programs")
    .select(`
      *,
      instructor:instructors(*)
    `)
    .eq("slug", slug)
    .eq("is_public", true)
    .eq("status", "ACTIVE")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 프로그램의 다음 스케줄 조회 (가장 가까운 미래 일정)
 */
export async function getNextScheduleForProgram(
  client: SupabaseClient<Database>,
  { programId }: { programId: number }
) {
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("schedules")
    .select("schedule_id, start_time, end_time")
    .eq("program_id", programId)
    .gte("start_time", now)
    .order("start_time", { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116: no rows returned
    throw error;
  }

  return data;
}
