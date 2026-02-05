/**
 * Admin Queries
 *
 * This file contains functions for admin-specific queries.
 * Uses organization_members junction table for role/state information.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

import { fromKST, nowKST } from "~/features/schedules/utils/kst";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type UserState = "NORMAL" | "GRADUATE" | "DELETED";
type UserType = "EXAMINEE" | "DROPPER" | "ADULT";

/**
 * Get all students (members with STUDENT role) for an organization with pagination
 */
export async function getStudentsPaginated(
  client: SupabaseClient<Database>,
  {
    organizationId,
    page = 1,
    pageSize = 20,
    stateFilter,
    typeFilter,
    search,
  }: {
    organizationId: string;
    page?: number;
    pageSize?: number;
    stateFilter?: UserState;
    typeFilter?: UserType;
    search?: string;
  },
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("organization_members")
    .select(
      `
      profile_id,
      role,
      state,
      type,
      created_at,
      profiles!inner (
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
        color,
        created_at
      )
    `,
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT")
    .order("state", { ascending: true }) // NORMAL first
    .order("created_at", { ascending: false })
    .range(from, to);

  if (stateFilter) {
    query = query.eq("state", stateFilter);
  }

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  if (search) {
    // Filter on the joined profiles table using proper syntax
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`, {
      referencedTable: "profiles",
    });
  }

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  // Transform data to include profile info at top level
  const students = data?.map((member) => ({
    ...member.profiles,
    profile_id: member.profile_id,
    role: member.role,
    state: member.state,
    type: member.type,
    member_created_at: member.created_at,
  }));

  return {
    students: students ?? [],
    totalCount: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
    currentPage: page,
  };
}

/**
 * Get a single student by ID (with organization check)
 */
export async function getStudentById(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
  }: { organizationId: string; studentId: string },
) {
  const { data: member, error: memberError } = await client
    .from("organization_members")
    .select("profile_id, role, state, type")
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT")
    .single();

  if (memberError) {
    throw memberError;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("*")
    .eq("profile_id", studentId)
    .single();

  if (profileError) {
    throw profileError;
  }

  return {
    ...profile,
    role: member.role,
    state: member.state,
    type: member.type,
  };
}

/**
 * Get all active students (NORMAL state) for schedule registration
 */
export async function getActiveStudents(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .select(
      `
      profile_id,
      profiles!inner (
        profile_id,
        name,
        color
      )
    `,
    )
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .order("profiles(name)", { ascending: true });

  if (error) {
    throw error;
  }

  // Transform to flat structure
  return data?.map((m) => ({
    profile_id: m.profile_id,
    name: m.profiles.name,
    color: m.profiles.color,
  }));
}

/**
 * Update a student profile
 */
export async function updateStudent(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
    profileUpdates,
    memberUpdates,
  }: {
    organizationId: string;
    studentId: string;
    profileUpdates?: ProfileUpdate;
    memberUpdates?: { state?: UserState; type?: UserType };
  },
) {
  // Update profile if there are profile updates
  if (profileUpdates && Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await client
      .from("profiles")
      .update(profileUpdates)
      .eq("profile_id", studentId);

    if (profileError) {
      throw profileError;
    }
  }

  // Update membership if there are member updates
  if (memberUpdates && Object.keys(memberUpdates).length > 0) {
    const { error: memberError } = await client
      .from("organization_members")
      .update(memberUpdates)
      .eq("organization_id", organizationId)
      .eq("profile_id", studentId);

    if (memberError) {
      throw memberError;
    }
  }

  // Return updated student
  return getStudentById(client, { organizationId, studentId });
}

/**
 * Graduate a student (set state to GRADUATE in organization_members)
 */
export async function graduateStudent(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
  }: { organizationId: string; studentId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .update({ state: "GRADUATE" })
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT")
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete a student (set state to DELETED in organization_members)
 */
export async function deleteStudent(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
  }: { organizationId: string; studentId: string },
) {
  const { data, error } = await client
    .from("organization_members")
    .update({ state: "DELETED" })
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT")
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get total hours for multiple students in an organization
 */
export async function getStudentsTotalHours(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentIds,
  }: { organizationId: string; studentIds: string[] },
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};

  const { data, error } = await client
    .from("schedules")
    .select("student_id, start_time, end_time")
    .eq("organization_id", organizationId)
    .in("student_id", studentIds)
    .lte("start_time", new Date().toISOString());

  if (error) {
    throw error;
  }

  const hoursByStudent: Record<string, number> = {};

  for (const schedule of data || []) {
    const start = new Date(schedule.start_time);
    const end = new Date(schedule.end_time);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (!hoursByStudent[schedule.student_id]) {
      hoursByStudent[schedule.student_id] = 0;
    }
    hoursByStudent[schedule.student_id] += hours;
  }

  return hoursByStudent;
}

/**
 * Get emails for multiple users from auth.users (requires adminClient)
 */
export async function getStudentEmails(
  adminClient: SupabaseClient<Database>,
  { studentIds }: { studentIds: string[] },
): Promise<Record<string, string>> {
  if (studentIds.length === 0) return {};

  const { data, error } = await adminClient.auth.admin.listUsers({
    perPage: 1000,
  });

  if (error) {
    console.error("Failed to get user emails:", error);
    return {};
  }

  const emailMap: Record<string, string> = {};
  const studentIdSet = new Set(studentIds);

  for (const user of data.users) {
    if (studentIdSet.has(user.id) && user.email) {
      emailMap[user.id] = user.email;
    }
  }

  return emailMap;
}

/**
 * Get dashboard statistics for an organization
 */
export async function getDashboardStats(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  // Get student counts by state from organization_members
  const { data: memberStats, error: memberError } = await client
    .from("organization_members")
    .select("state")
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT");

  if (memberError) {
    throw memberError;
  }

  const stats = {
    totalStudents: memberStats?.length ?? 0,
    activeStudents:
      memberStats?.filter((s) => s.state === "NORMAL").length ?? 0,
    graduatedStudents:
      memberStats?.filter((s) => s.state === "GRADUATE").length ?? 0,
    deletedStudents:
      memberStats?.filter((s) => s.state === "DELETED").length ?? 0,
  };

  // Get today's schedule count for this organization (KST)
  const now = nowKST();
  const today = fromKST(now.year, now.month, now.day);
  const tomorrow = fromKST(now.year, now.month, now.day + 1);

  const monthStart = fromKST(now.year, now.month, 1);
  const monthEnd = fromKST(now.year, now.month + 1, 0, 23, 59, 59);

  const [
    { count: todayScheduleCount, error: scheduleError },
    { count: monthlyScheduleCount, error: monthlyError },
  ] = await Promise.all([
    client
      .from("schedules")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("start_time", today.toISOString())
      .lt("start_time", tomorrow.toISOString()),
    client
      .from("schedules")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("start_time", monthStart.toISOString())
      .lte("start_time", monthEnd.toISOString()),
  ]);

  if (scheduleError) {
    throw scheduleError;
  }
  if (monthlyError) {
    throw monthlyError;
  }

  return {
    ...stats,
    todayScheduleCount: todayScheduleCount ?? 0,
    monthlyScheduleCount: monthlyScheduleCount ?? 0,
  };
}
