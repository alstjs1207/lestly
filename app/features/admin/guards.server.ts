/**
 * Admin Guards Module
 *
 * This module provides utility functions for protecting admin routes
 * by enforcing admin role requirements and organization membership.
 *
 * Uses organization_members junction table for N:N relationship
 * between profiles and organizations.
 */
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { data, redirect } from "react-router";

import type { Database } from "database.types";
import adminClient from "~/core/lib/supa-admin-client.server";

export interface AdminUser {
  user: User;
  organizationId: string;
}

export interface AdminMembership {
  organization_id: string;
  role: "ADMIN" | "STUDENT";
  state: "NORMAL" | "GRADUATE" | "DELETED";
}

export interface SuperAdminUser {
  user: User;
  isSuperAdmin: true;
}

/**
 * Require admin role for a route or action
 *
 * This function checks if a user has admin role in any organization.
 * If the user is not an admin, it throws a 403 Forbidden response.
 * If the user has no admin membership, it redirects to org setup.
 *
 * @param client - The Supabase client instance
 * @param organizationId - Optional specific organization to check access for
 * @throws {Response} 403 Forbidden if user is not an admin
 * @throws {Response} Redirect to org setup if admin has no organization
 * @returns {AdminUser} The authenticated user and their organization ID
 */
export async function requireAdminRole(
  client: SupabaseClient<Database>,
  organizationId?: string,
): Promise<AdminUser> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  // Get user's admin memberships from organization_members
  // Using adminClient to bypass RLS for this server-side check
  const { data: memberships, error } = await adminClient
    .from("organization_members")
    .select("organization_id, role, state")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL");

  if (error) {
    throw data({ error: "Failed to check admin status" }, { status: 500 });
  }

  if (!memberships || memberships.length === 0) {
    // User has no admin memberships, redirect to organization setup
    throw redirect("/admin/signup/organization");
  }

  // If specific organizationId is requested, verify access
  if (organizationId) {
    const hasAccess = memberships.some(
      (m) => m.organization_id === organizationId,
    );
    if (!hasAccess) {
      throw data(
        { error: "Access denied to this organization" },
        { status: 403 },
      );
    }
    return { user, organizationId };
  }

  // Default to first organization
  return { user, organizationId: memberships[0].organization_id };
}

/**
 * Check if user is admin in any organization (non-throwing version)
 *
 * @param client - The Supabase client instance
 * @returns true if user is admin in any organization, false otherwise
 */
export async function isAdmin(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: memberships, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL")
    .limit(1);

  if (error || !memberships) {
    return false;
  }

  return memberships.length > 0;
}

/**
 * Check if user is admin with at least one organization (non-throwing version)
 *
 * @param client - The Supabase client instance
 * @returns true if user is admin with organization, false otherwise
 */
export async function isAdminWithOrganization(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  return isAdmin(client);
}

/**
 * Get current user's profile
 *
 * @param client - The Supabase client instance
 * @returns The user's profile or null
 */
export async function getCurrentUserProfile(client: SupabaseClient<Database>) {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("profile_id", user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return profile;
}

/**
 * Get current user's first organization ID (for backwards compatibility)
 *
 * @param client - The Supabase client instance
 * @returns The user's first organization ID or null
 */
export async function getCurrentOrganizationId(
  client: SupabaseClient<Database>,
): Promise<string | null> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: memberships, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("state", "NORMAL")
    .limit(1);

  if (error || !memberships || memberships.length === 0) {
    return null;
  }

  return memberships[0].organization_id;
}

/**
 * Get all organizations where user is an admin
 *
 * @param client - The Supabase client instance
 * @returns Array of admin memberships or empty array
 */
export async function getAdminOrganizations(
  client: SupabaseClient<Database>,
): Promise<AdminMembership[]> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: memberships, error } = await client
    .from("organization_members")
    .select("organization_id, role, state")
    .eq("profile_id", user.id)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL");

  if (error || !memberships) {
    return [];
  }

  return memberships as AdminMembership[];
}

/**
 * Check if user is admin of a specific organization
 *
 * @param client - The Supabase client instance
 * @param organizationId - The organization ID to check
 * @returns true if user is admin of the organization, false otherwise
 */
export async function isAdminOfOrganization(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: membership, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .eq("role", "ADMIN")
    .eq("state", "NORMAL")
    .single();

  if (error || !membership) {
    return false;
  }

  return true;
}

/**
 * Check if user is a super admin (service-level administrator)
 *
 * Super admins have app_metadata.role = 'super_admin' set by Admin API.
 * This role grants access to all organizations and global management features.
 *
 * @param client - The Supabase client instance
 * @returns true if user is a super admin, false otherwise
 */
export async function isSuperAdmin(
  client: SupabaseClient<Database>,
): Promise<boolean> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return false;
  }

  // Check app_metadata for super_admin role
  const role = user.app_metadata?.role;
  return role === "super_admin";
}

/**
 * Require super admin role for a route or action
 *
 * This function checks if a user has super admin role.
 * Super admins can access all organizations and global management features.
 * If the user is not a super admin, it throws a 403 Forbidden response.
 *
 * @param client - The Supabase client instance
 * @throws {Response} 403 Forbidden if user is not a super admin
 * @throws {Response} Redirect to login if not authenticated
 * @returns {SuperAdminUser} The authenticated super admin user
 */
export async function requireSuperAdmin(
  client: SupabaseClient<Database>,
): Promise<SuperAdminUser> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw redirect("/login");
  }

  // Check app_metadata for super_admin role
  const role = user.app_metadata?.role;
  if (role !== "super_admin") {
    throw data(
      { error: "Super admin access required" },
      { status: 403 },
    );
  }

  return { user, isSuperAdmin: true };
}

/**
 * Get all organizations (for super admin only)
 *
 * @param client - The Supabase client instance (should be admin client)
 * @returns Array of all organizations
 */
export async function getAllOrganizations() {
  const { data: organizations, error } = await adminClient
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return organizations;
}

/**
 * Get global statistics (for super admin dashboard)
 *
 * @returns Object containing global statistics
 */
export async function getGlobalStats() {
  const [orgsResult, membersResult, schedulesResult] = await Promise.all([
    adminClient.from("organizations").select("organization_id", { count: "exact", head: true }),
    adminClient.from("organization_members").select("profile_id", { count: "exact", head: true }),
    adminClient.from("schedules").select("schedule_id", { count: "exact", head: true }),
  ]);

  return {
    totalOrganizations: orgsResult.count ?? 0,
    totalMembers: membersResult.count ?? 0,
    totalSchedules: schedulesResult.count ?? 0,
  };
}
