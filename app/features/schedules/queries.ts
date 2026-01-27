/**
 * Schedule Queries
 *
 * This file contains functions for querying and managing schedules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

import { getMaxConcurrentStudents } from "~/features/app-settings/queries";

type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
type ScheduleInsert = Database["public"]["Tables"]["schedules"]["Insert"];
type ScheduleUpdate = Database["public"]["Tables"]["schedules"]["Update"];

/**
 * Get schedules for a specific month
 */
export async function getMonthlySchedules(
  client: SupabaseClient<Database>,
  { organizationId, year, month }: { organizationId: string; year: number; month: number },
) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color
      ),
      program:programs(
        program_id,
        title
      )
    `,
    )
    .eq("organization_id", organizationId)
    .gte("start_time", startDate.toISOString())
    .lte("start_time", endDate.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get schedules for a specific date
 */
export async function getDailySchedules(
  client: SupabaseClient<Database>,
  { organizationId, date }: { organizationId: string; date: Date },
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color,
        phone,
        region
      ),
      program:programs(
        program_id,
        title
      )
    `,
    )
    .eq("organization_id", organizationId)
    .gte("start_time", startOfDay.toISOString())
    .lte("start_time", endOfDay.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get schedules for a specific student
 */
export async function getStudentSchedules(
  client: SupabaseClient<Database>,
  params:
    | { studentId: string; year: number; month: number }
    | { studentId: string; startDate: Date; endDate: Date },
) {
  let queryStartDate: Date;
  let queryEndDate: Date;

  if ("year" in params && "month" in params) {
    queryStartDate = new Date(params.year, params.month - 1, 1);
    queryEndDate = new Date(params.year, params.month, 0, 23, 59, 59);
  } else {
    queryStartDate = params.startDate;
    queryEndDate = params.endDate;
  }

  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      program:programs(
        program_id,
        title
      )
    `,
    )
    .eq("student_id", params.studentId)
    .gte("start_time", queryStartDate.toISOString())
    .lte("start_time", queryEndDate.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get a single schedule by ID
 */
export async function getScheduleById(
  client: SupabaseClient<Database>,
  { scheduleId }: { scheduleId: number },
) {
  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color
      )
    `,
    )
    .eq("schedule_id", scheduleId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Check if a time slot has reached the concurrent limit
 */
export async function checkConcurrentLimit(
  client: SupabaseClient<Database>,
  {
    organizationId,
    startTime,
    endTime,
    excludeScheduleId,
  }: {
    organizationId: string;
    startTime: Date;
    endTime: Date;
    excludeScheduleId?: number;
  },
) {
  const maxConcurrent = await getMaxConcurrentStudents(client, { organizationId });

  let query = client
    .from("schedules")
    .select("schedule_id", { count: "exact" })
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString());

  if (excludeScheduleId) {
    query = query.neq("schedule_id", excludeScheduleId);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return {
    allowed: (count ?? 0) < maxConcurrent,
    currentCount: count ?? 0,
    maxCount: maxConcurrent,
  };
}

/**
 * Create a new schedule
 */
export async function createSchedule(
  client: SupabaseClient<Database>,
  schedule: ScheduleInsert,
) {
  const { data, error } = await client
    .from("schedules")
    .insert(schedule)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Create multiple schedules (for recurring schedules)
 */
export async function createSchedules(
  client: SupabaseClient<Database>,
  schedules: ScheduleInsert[],
) {
  const { data, error } = await client
    .from("schedules")
    .insert(schedules)
    .select();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update a schedule
 */
export async function updateSchedule(
  client: SupabaseClient<Database>,
  { scheduleId, updates }: { scheduleId: number; updates: ScheduleUpdate },
) {
  const { data, error } = await client
    .from("schedules")
    .update(updates)
    .eq("schedule_id", scheduleId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete a schedule
 */
export async function deleteSchedule(
  client: SupabaseClient<Database>,
  { scheduleId }: { scheduleId: number },
) {
  const { error } = await client
    .from("schedules")
    .delete()
    .eq("schedule_id", scheduleId);

  if (error) {
    throw error;
  }

  return true;
}

/**
 * Delete all future schedules from a recurring series
 */
export async function deleteFutureSchedules(
  client: SupabaseClient<Database>,
  { parentScheduleId, fromDate }: { parentScheduleId: number; fromDate: Date },
) {
  const { error } = await client
    .from("schedules")
    .delete()
    .eq("parent_schedule_id", parentScheduleId)
    .gte("start_time", fromDate.toISOString());

  if (error) {
    throw error;
  }

  return true;
}

/**
 * Get weekly schedules for a student (for student detail view)
 */
export async function getStudentWeeklySchedules(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      program:programs(
        program_id,
        title
      )
    `,
    )
    .eq("student_id", studentId)
    .gte("start_time", startOfWeek.toISOString())
    .lte("start_time", endOfWeek.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Calculate total class hours for a student
 */
export async function calculateStudentTotalHours(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
) {
  const { data, error } = await client
    .from("schedules")
    .select("start_time, end_time")
    .eq("student_id", studentId)
    .lte("start_time", new Date().toISOString());

  if (error) {
    throw error;
  }

  let totalHours = 0;
  for (const schedule of data) {
    const start = new Date(schedule.start_time);
    const end = new Date(schedule.end_time);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    totalHours += hours;
  }

  return totalHours;
}

/**
 * Get next week's schedules for a student
 */
export async function getStudentNextWeekSchedules(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
) {
  const today = new Date();

  // Start of next week (next Sunday)
  const startOfNextWeek = new Date(today);
  startOfNextWeek.setDate(today.getDate() - today.getDay() + 7);
  startOfNextWeek.setHours(0, 0, 0, 0);

  // End of next week (next Saturday)
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);

  const { data, error } = await client
    .from("schedules")
    .select(
      `
      *,
      program:programs(
        program_id,
        title
      )
    `,
    )
    .eq("student_id", studentId)
    .gte("start_time", startOfNextWeek.toISOString())
    .lte("start_time", endOfNextWeek.toISOString())
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get monthly hours for a student (for yearly chart)
 * Returns hours grouped by month for the given year
 */
export async function getStudentYearlyStats(
  client: SupabaseClient<Database>,
  { studentId, year }: { studentId: string; year: number },
): Promise<{ month: number; hours: number }[]> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  const { data, error } = await client
    .from("schedules")
    .select("start_time, end_time")
    .eq("student_id", studentId)
    .gte("start_time", startDate.toISOString())
    .lte("start_time", endDate.toISOString())
    .lte("start_time", new Date().toISOString()); // Only count past schedules

  if (error) {
    throw error;
  }

  // Initialize all months with 0 hours
  const monthlyHours: Record<number, number> = {};
  for (let i = 1; i <= 12; i++) {
    monthlyHours[i] = 0;
  }

  // Calculate hours for each month
  for (const schedule of data) {
    const start = new Date(schedule.start_time);
    const end = new Date(schedule.end_time);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const month = start.getMonth() + 1;
    monthlyHours[month] += hours;
  }

  return Object.entries(monthlyHours).map(([month, hours]) => ({
    month: parseInt(month),
    hours: Math.round(hours * 10) / 10,
  }));
}

/**
 * Get monthly stats for a student
 * Returns: this month hours, last month hours, this month schedule count
 */
export async function getStudentMonthlyStats(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
): Promise<{
  thisMonthHours: number;
  lastMonthHours: number;
  thisMonthCount: number;
  lastMonthCount: number;
}> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // This month schedules (only past ones)
  const { data: thisMonthData, error: thisMonthError } = await client
    .from("schedules")
    .select("start_time, end_time")
    .eq("student_id", studentId)
    .gte("start_time", thisMonthStart.toISOString())
    .lte("start_time", now.toISOString());

  if (thisMonthError) throw thisMonthError;

  // Last month schedules
  const { data: lastMonthData, error: lastMonthError } = await client
    .from("schedules")
    .select("start_time, end_time")
    .eq("student_id", studentId)
    .gte("start_time", lastMonthStart.toISOString())
    .lte("start_time", lastMonthEnd.toISOString());

  if (lastMonthError) throw lastMonthError;

  const calculateHours = (schedules: { start_time: string; end_time: string }[]) => {
    return schedules.reduce((sum, s) => {
      const start = new Date(s.start_time);
      const end = new Date(s.end_time);
      return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }, 0);
  };

  return {
    thisMonthHours: Math.round(calculateHours(thisMonthData || []) * 10) / 10,
    lastMonthHours: Math.round(calculateHours(lastMonthData || []) * 10) / 10,
    thisMonthCount: thisMonthData?.length || 0,
    lastMonthCount: lastMonthData?.length || 0,
  };
}

/**
 * Get student's learning streak (consecutive days with schedules)
 */
export async function getStudentStreak(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
): Promise<number> {
  const { data, error } = await client
    .from("schedules")
    .select("start_time")
    .eq("student_id", studentId)
    .lte("start_time", new Date().toISOString())
    .order("start_time", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return 0;

  // Get unique dates
  const dates = [...new Set(
    data.map(s => new Date(s.start_time).toDateString())
  )].map(d => new Date(d));

  dates.sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < dates.length; i++) {
    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - i);
    expectedDate.setHours(0, 0, 0, 0);

    if (dates[i].toDateString() === expectedDate.toDateString()) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get student's class start date from profiles
 */
export async function getStudentClassDates(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
): Promise<{ classStartDate: string | null; classEndDate: string | null }> {
  const { data, error } = await client
    .from("profiles")
    .select("class_start_date, class_end_date")
    .eq("profile_id", studentId)
    .single();

  if (error) throw error;

  return {
    classStartDate: data?.class_start_date || null,
    classEndDate: data?.class_end_date || null,
  };
}

/**
 * Check if a student has a time conflict across all programs
 * Returns true if there is a conflict
 */
export async function checkStudentTimeConflict(
  client: SupabaseClient<Database>,
  {
    studentId,
    startTime,
    endTime,
    excludeScheduleId,
  }: {
    studentId: string;
    startTime: Date;
    endTime: Date;
    excludeScheduleId?: number;
  },
): Promise<boolean> {
  let query = client
    .from("schedules")
    .select("schedule_id", { count: "exact" })
    .eq("student_id", studentId)
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString());

  if (excludeScheduleId) {
    query = query.neq("schedule_id", excludeScheduleId);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}
