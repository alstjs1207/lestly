import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

/** The selected class determines the tenant; never assume a student has one membership. */
export async function getStudentBookingOrganization(
  client: SupabaseClient<Database>,
  { profileId, programId }: { profileId: string; programId: number },
) {
  if (!Number.isSafeInteger(programId) || programId < 1) return null;
  const { data: program, error: programError } = await client
    .from("programs")
    .select("organization_id")
    .eq("program_id", programId)
    .maybeSingle();
  if (programError) throw programError;
  if (!program) return null;
  const { data: member, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("organization_id", program.organization_id)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .maybeSingle();
  if (error) throw error;
  return member?.organization_id ?? null;
}
