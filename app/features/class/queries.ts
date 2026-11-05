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

type ProgramRow = Database["public"]["Tables"]["programs"]["Row"];
type InstructorRow = Database["public"]["Tables"]["instructors"]["Row"];

// Matches 0044's explicit public RPC contract, including the legacy public footer.
export type PublicProgram = Pick<
  ProgramRow,
  | "program_id"
  | "slug"
  | "title"
  | "subtitle"
  | "description"
  | "cover_image_url"
  | "location_type"
  | "location_address"
  | "duration_minutes"
  | "total_sessions"
  | "max_capacity"
  | "curriculum"
> & {
  instructor: Pick<
    InstructorRow,
    "name" | "info" | "photo_url" | "career" | "sns"
  > | null;
};

/** Read only the public introduction, independent of the visitor's account role. */
export async function getPublicProgramBySlug(
  client: SupabaseClient<Database>,
  { slug }: { slug: string },
): Promise<PublicProgram | null> {
  const { data, error } = await client.rpc("get_public_program_by_slug", {
    p_slug: slug,
  });
  if (error) throw error;
  // The fixed SECURITY DEFINER projection is the trusted server-side boundary.
  return data as PublicProgram | null;
}
