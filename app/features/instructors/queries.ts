/**
 * Instructor Queries
 *
 * Database query functions for instructor management.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

type Instructor = Database["public"]["Tables"]["instructors"]["Row"];
type InstructorInsert = Database["public"]["Tables"]["instructors"]["Insert"];
type InstructorUpdate = Database["public"]["Tables"]["instructors"]["Update"];

/**
 * Get all instructors for an organization
 */
export async function getInstructors(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
): Promise<Instructor[]> {
  const { data, error } = await client
    .from("instructors")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get instructor by ID
 */
export async function getInstructor(
  client: SupabaseClient<Database>,
  { instructorId }: { instructorId: number },
): Promise<Instructor | null> {
  const { data, error } = await client
    .from("instructors")
    .select("*")
    .eq("instructor_id", instructorId)
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
 * Create a new instructor
 */
export async function createInstructor(
  client: SupabaseClient<Database>,
  instructorData: InstructorInsert,
): Promise<Instructor> {
  const { data, error } = await client
    .from("instructors")
    .insert(instructorData)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update instructor
 */
export async function updateInstructor(
  client: SupabaseClient<Database>,
  { instructorId, updates }: { instructorId: number; updates: InstructorUpdate },
): Promise<Instructor> {
  const { data, error } = await client
    .from("instructors")
    .update(updates)
    .eq("instructor_id", instructorId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete instructor
 */
export async function deleteInstructor(
  client: SupabaseClient<Database>,
  { instructorId }: { instructorId: number },
): Promise<void> {
  const { error } = await client
    .from("instructors")
    .delete()
    .eq("instructor_id", instructorId);

  if (error) {
    throw error;
  }
}
