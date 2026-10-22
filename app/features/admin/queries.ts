/**
 * Admin Queries
 *
 * This file contains functions for admin-specific queries.
 * Uses organization_members junction table for role/state information.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  buildStudentSearchFilter,
  normalizePagination,
} from "../../core/lib/query-utils.ts";
import { fromKST, nowKST } from "../schedules/utils/kst.ts";
import { getStudentHoursTotals } from "../schedules/utils/student-hours.ts";

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
  const pagination = normalizePagination(page, pageSize);

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
        auth_user_id,
        contact_email,
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
    .order("profile_id", { ascending: true })
    .range(pagination.from, pagination.to);

  if (stateFilter) {
    query = query.eq("state", stateFilter);
  }

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  if (search) {
    const filter = buildStudentSearchFilter(search);
    if (filter) query = query.or(filter, { referencedTable: "profiles" });
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
    totalPages: Math.ceil((count ?? 0) / pagination.pageSize),
    currentPage: pagination.page,
  };
}

/**
 * Get a single student by ID (with organization check)
 */
export async function getStudentById(
  client: SupabaseClient<Database>,
  { organizationId, studentId }: { organizationId: string; studentId: string },
) {
  const { data: member, error } = await client
    .from("organization_members")
    .select("role, state, type, profiles!inner(*)")
    .eq("organization_id", organizationId)
    .eq("profile_id", studentId)
    .eq("role", "STUDENT")
    .single();

  if (error) throw error;

  return {
    ...member.profiles,
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
        color,
        phone
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
    phone: m.profiles.phone,
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
  const current = await getStudentById(client, { organizationId, studentId });
  const profile = { ...current, ...profileUpdates };
  const { error } = await client.rpc("save_managed_student", {
    p_organization_id: organizationId,
    p_student_id: studentId,
    p_values: {
      name: profile.name,
      phone: profile.phone,
      region: profile.region,
      email: profile.contact_email,
      birth_date: profile.birth_date,
      class_start_date: profile.class_start_date,
      class_end_date: profile.class_end_date,
      parent_name: profile.parent_name,
      parent_phone: profile.parent_phone,
      description: profile.description,
      color: profile.color,
      type: memberUpdates?.type ?? current.type ?? "EXAMINEE",
      state: memberUpdates?.state ?? current.state,
    },
  });
  if (error) throw error;

  // Return updated student
  return getStudentById(client, { organizationId, studentId });
}

/**
 * Graduate a student (set state to GRADUATE in organization_members)
 */
export async function graduateStudent(
  client: SupabaseClient<Database>,
  { organizationId, studentId }: { organizationId: string; studentId: string },
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
  { organizationId, studentId }: { organizationId: string; studentId: string },
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
  return getStudentHoursTotals(client, { organizationId, studentIds });
}

/**
 * Get dashboard statistics for an organization
 */
export async function getDashboardStats(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  // Get today's schedule count for this organization (KST)
  const now = nowKST();
  const today = fromKST(now.year, now.month, now.day);
  const tomorrow = fromKST(now.year, now.month, now.day + 1);

  const monthStart = fromKST(now.year, now.month, 1);
  const monthEnd = fromKST(now.year, now.month + 1, 1);

  // Run dashboard queries in parallel so the initial setup checklist does not
  // add extra round trips for new organizations.
  const [
    { count: totalStudents, error: memberError },
    { count: activeStudents, error: activeMemberError },
    { count: graduatedStudents, error: graduatedMemberError },
    { count: deletedStudents, error: deletedMemberError },
    { count: todayScheduleCount, error: scheduleError },
    { count: monthlyScheduleCount, error: monthlyError },
    { count: totalScheduleCount, error: totalScheduleError },
    { count: activeProgramCount, error: programError },
  ] = await Promise.all([
    client
      .from("organization_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "STUDENT"),
    ...(["NORMAL", "GRADUATE", "DELETED"] as const).map((state) =>
      client
        .from("organization_members")
        .select("profile_id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("role", "STUDENT")
        .eq("state", state),
    ),
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
      .lt("start_time", monthEnd.toISOString()),
    client
      .from("schedules")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    client
      .from("programs")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE"),
  ]);

  if (memberError) {
    throw memberError;
  }
  if (activeMemberError) throw activeMemberError;
  if (graduatedMemberError) throw graduatedMemberError;
  if (deletedMemberError) throw deletedMemberError;
  if (scheduleError) {
    throw scheduleError;
  }
  if (monthlyError) {
    throw monthlyError;
  }
  if (totalScheduleError) {
    throw totalScheduleError;
  }
  if (programError) {
    throw programError;
  }

  return {
    totalStudents: totalStudents ?? 0,
    activeStudents: activeStudents ?? 0,
    graduatedStudents: graduatedStudents ?? 0,
    deletedStudents: deletedStudents ?? 0,
    todayScheduleCount: todayScheduleCount ?? 0,
    monthlyScheduleCount: monthlyScheduleCount ?? 0,
    totalScheduleCount: totalScheduleCount ?? 0,
    activeProgramCount: activeProgramCount ?? 0,
  };
}
