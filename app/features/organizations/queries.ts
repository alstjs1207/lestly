/**
 * Organization Queries
 *
 * Database query functions for organization management.
 * Includes queries for organization_members junction table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationUpdate =
  Database["public"]["Tables"]["organizations"]["Update"];
type OrganizationMember =
  Database["public"]["Tables"]["organization_members"]["Row"];

/**
 * Create a new organization
 */
export async function createOrganization(
  client: SupabaseClient<Database>,
  { name, description }: { name: string; description?: string },
): Promise<Organization> {
  const { data, error } = await client
    .from("organizations")
    .insert({ name, description })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get organization by ID
 */
export async function getOrganization(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
): Promise<Organization | null> {
  const { data, error } = await client
    .from("organizations")
    .select("*")
    .eq("organization_id", organizationId)
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
 * Update organization
 */
export async function updateOrganization(
  client: SupabaseClient<Database>,
  {
    organizationId,
    updates,
  }: { organizationId: string; updates: OrganizationUpdate },
): Promise<Organization> {
  const { data, error } = await client
    .from("organizations")
    .update(updates)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get user's organizations with role information
 */
export async function getUserOrganizations(
  client: SupabaseClient<Database>,
  { profileId }: { profileId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .select(
      `
      organization_id,
      role,
      state,
      type,
      organizations (
        organization_id,
        name,
        description
      )
    `,
    )
    .eq("profile_id", profileId)
    .eq("state", "NORMAL");

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get all members of an organization
 */
export async function getOrganizationMembers(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .select(
      `
      profile_id,
      role,
      state,
      type,
      created_at,
      profiles (
        profile_id,
        name,
        avatar_url,
        phone,
        region,
        birth_date,
        class_start_date,
        class_end_date,
        parent_name,
        parent_phone,
        description,
        color
      )
    `,
    )
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get active students (members with STUDENT role and NORMAL state) of an organization
 */
export async function getOrganizationStudents(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .select(
      `
      profile_id,
      role,
      state,
      type,
      created_at,
      profiles (
        profile_id,
        name,
        avatar_url,
        phone,
        region,
        birth_date,
        class_start_date,
        class_end_date,
        parent_name,
        parent_phone,
        description,
        color
      )
    `,
    )
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL");

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get a specific membership
 */
export async function getMembership(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
  }: { organizationId: string; profileId: string },
): Promise<OrganizationMember | null> {
  const { data, error } = await client
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
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
 * Update a membership (e.g., change role or state)
 */
export async function updateMembership(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
    updates,
  }: {
    organizationId: string;
    profileId: string;
    updates: Partial<
      Pick<OrganizationMember, "role" | "state" | "type">
    >;
  },
): Promise<OrganizationMember> {
  const { data, error } = await client
    .from("organization_members")
    .update(updates)
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Add a member to an organization
 */
export async function addMember(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
    role,
    type,
  }: {
    organizationId: string;
    profileId: string;
    role: "STUDENT" | "ADMIN";
    type?: "EXAMINEE" | "DROPPER" | "ADULT";
  },
): Promise<OrganizationMember> {
  const { data, error } = await client
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      profile_id: profileId,
      role,
      state: "NORMAL",
      type,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Remove a member from an organization (soft delete by setting state to DELETED)
 */
export async function removeMember(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
  }: { organizationId: string; profileId: string },
): Promise<OrganizationMember> {
  const { data, error } = await client
    .from("organization_members")
    .update({ state: "DELETED" })
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Graduate a student (set state to GRADUATE)
 */
export async function graduateStudent(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
  }: { organizationId: string; profileId: string },
): Promise<OrganizationMember> {
  const { data, error } = await client
    .from("organization_members")
    .update({ state: "GRADUATE" })
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get user's first organization membership (for students who belong to one org)
 */
export async function getOrganizationMembership(
  client: SupabaseClient<Database>,
  { profileId }: { profileId: string },
): Promise<OrganizationMember | null> {
  const { data, error } = await client
    .from("organization_members")
    .select("*")
    .eq("profile_id", profileId)
    .eq("state", "NORMAL")
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data;
}
