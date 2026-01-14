/**
 * Program Queries
 *
 * Database query functions for program management.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

type Program = Database["public"]["Tables"]["programs"]["Row"];
type ProgramInsert = Database["public"]["Tables"]["programs"]["Insert"];
type ProgramUpdate = Database["public"]["Tables"]["programs"]["Update"];

/**
 * Get all programs for an organization
 */
export async function getPrograms(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("programs")
    .select("*, instructor:instructors(*)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get active programs for an organization (for students)
 */
export async function getActivePrograms(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
): Promise<Program[]> {
  const { data, error } = await client
    .from("programs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .order("title", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get program by ID
 */
export async function getProgram(
  client: SupabaseClient<Database>,
  { programId }: { programId: number },
) {
  const { data, error } = await client
    .from("programs")
    .select("*, instructor:instructors(*)")
    .eq("program_id", programId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
}

/**
 * Create a new program
 */
export async function createProgram(
  client: SupabaseClient<Database>,
  programData: ProgramInsert,
): Promise<Program> {
  const { data, error } = await client
    .from("programs")
    .insert(programData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update program
 */
export async function updateProgram(
  client: SupabaseClient<Database>,
  { programId, updates }: { programId: number; updates: ProgramUpdate },
): Promise<Program> {
  const { data, error } = await client
    .from("programs")
    .update(updates)
    .eq("program_id", programId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete program
 */
export async function deleteProgram(
  client: SupabaseClient<Database>,
  { programId }: { programId: number },
): Promise<void> {
  const { error } = await client
    .from("programs")
    .delete()
    .eq("program_id", programId);

  if (error) {
    throw error;
  }
}

/**
 * Check if program has any schedules
 */
export async function hasSchedules(
  client: SupabaseClient<Database>,
  { programId }: { programId: number },
): Promise<boolean> {
  const { count, error } = await client
    .from("schedules")
    .select("*", { count: "exact", head: true })
    .eq("program_id", programId);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

/**
 * Count schedules by program for an organization
 */
export async function countSchedulesByProgram(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
): Promise<Record<number, number>> {
  const { data, error } = await client
    .from("schedules")
    .select("program_id")
    .eq("organization_id", organizationId)
    .not("program_id", "is", null);

  if (error) {
    throw error;
  }

  const counts: Record<number, number> = {};
  for (const schedule of data) {
    if (schedule.program_id) {
      counts[schedule.program_id] = (counts[schedule.program_id] || 0) + 1;
    }
  }

  return counts;
}
