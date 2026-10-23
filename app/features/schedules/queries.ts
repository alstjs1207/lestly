/**
 * Schedule Queries
 *
 * This file contains functions for querying and managing schedules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "~/core/lib/query-utils";
import { getMaxConcurrentStudents } from "~/features/app-settings/queries";
import { getKSTMonthRange } from "~/features/schedules/utils/calendar-month";
import { fromKST, nowKST, toKST } from "~/features/schedules/utils/kst";
import {
  type ScheduleCandidate,
  validateScheduleCandidatesAgainstExisting,
} from "~/features/schedules/utils/schedule-validation";
import { getStudentHoursTotals } from "~/features/schedules/utils/student-hours";
import { getCurrentScheduleStreak } from "~/features/schedules/utils/student-streak";

type Schedule = Database["public"]["Tables"]["schedules"]["Row"];
type ScheduleInsert = Database["public"]["Tables"]["schedules"]["Insert"];
type ScheduleUpdate = Database["public"]["Tables"]["schedules"]["Update"];

/**
 * Get schedules for a specific month
 */
export async function getMonthlySchedules(
  client: SupabaseClient<Database>,
  {
    organizationId,
    year,
    month,
  }: { organizationId: string; year: number; month: number },
) {
  const { startDate, endDate } = getKSTMonthRange(year, month);

  return fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select(
        `
      schedule_id, student_id, program_id, start_time, end_time,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color,
        region
      ),
      program:programs!schedules_program_id_programs_program_id_fk(
        program_id,
        title
      )
    `,
      )
      .eq("organization_id", organizationId)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Get schedules for a specific date
 */
export async function getDailySchedules(
  client: SupabaseClient<Database>,
  { organizationId, date }: { organizationId: string; date: Date },
) {
  const kst = toKST(date);
  const startOfDay = fromKST(kst.year, kst.month, kst.day, 0, 0, 0);
  const endOfDay = fromKST(kst.year, kst.month, kst.day + 1);

  return fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select(
        `
      schedule_id, student_id, program_id, start_time, end_time,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color,
        phone,
        region
      ),
      program:programs!schedules_program_id_programs_program_id_fk(
        program_id,
        title
      )
    `,
      )
      .eq("organization_id", organizationId)
      .gte("start_time", startOfDay.toISOString())
      .lt("start_time", endOfDay.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Get upcoming schedules starting today in KST.
 */
export async function getUpcomingSchedules(
  client: SupabaseClient<Database>,
  { organizationId, days = 14 }: { organizationId: string; days?: number },
) {
  const now = nowKST();
  const startDate = fromKST(now.year, now.month, now.day);
  const endDate = fromKST(now.year, now.month, now.day + days);

  return fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select(
        `
      schedule_id, student_id, program_id, start_time, end_time,
      student:profiles!schedules_student_id_profiles_profile_id_fk(
        profile_id,
        name,
        color,
        phone,
        region
      ),
      program:programs!schedules_program_id_programs_program_id_fk(
        program_id,
        title
      )
    `,
      )
      .eq("organization_id", organizationId)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Get schedules for a specific student
 */
export async function getStudentSchedules(
  client: SupabaseClient<Database>,
  params:
    | {
        studentId: string;
        organizationId?: string;
        year: number;
        month: number;
      }
    | {
        studentId: string;
        organizationId?: string;
        startDate: Date;
        endDate: Date;
        endExclusive?: boolean;
      },
) {
  let queryStartDate: Date;
  let queryEndDate: Date;

  if ("year" in params && "month" in params) {
    const range = getKSTMonthRange(params.year, params.month);
    queryStartDate = range.startDate;
    queryEndDate = range.endDate;
  } else {
    queryStartDate = params.startDate;
    queryEndDate = params.endDate;
  }

  return fetchAllRows((from, to) => {
    let query = client
      .from("schedules")
      .select(
        `
      *,
      program:programs!schedules_program_id_programs_program_id_fk(
        program_id,
        title
      )
    `,
      )
      .eq("student_id", params.studentId)
      .gte("start_time", queryStartDate.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true });
    if (params.organizationId)
      query = query.eq("organization_id", params.organizationId);
    query =
      "year" in params || params.endExclusive
        ? query.lt("start_time", queryEndDate.toISOString())
        : query.lte("start_time", queryEndDate.toISOString());
    return query.range(from, to);
  });
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
  const maxConcurrent = await getMaxConcurrentStudents(client, {
    organizationId,
  });

  let query = client
    .from("schedules")
    .select("schedule_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
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
 * Validate schedule creation by checking concurrent limit and student time conflict in a single query
 */
export async function validateScheduleCreation(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
    startTime,
    endTime,
  }: {
    organizationId: string;
    studentId: string;
    startTime: Date;
    endTime: Date;
  },
) {
  const maxConcurrent = await getMaxConcurrentStudents(client, {
    organizationId,
  });

  const data = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select("schedule_id, student_id")
      .eq("organization_id", organizationId)
      .lt("start_time", endTime.toISOString())
      .gt("end_time", startTime.toISOString())
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );

  const currentCount = data?.length ?? 0;
  const hasConflict = data?.some((s) => s.student_id === studentId) ?? false;

  return {
    allowed: currentCount < maxConcurrent,
    currentCount,
    maxCount: maxConcurrent,
    hasConflict,
  };
}

/**
 * Validate every interval in a recurring or multi-student request.
 * Existing schedules that are about to be updated can be excluded by ID.
 */
export async function validateScheduleBatch(
  client: SupabaseClient<Database>,
  {
    organizationId,
    candidates,
    excludeScheduleIds = [],
  }: {
    organizationId: string;
    candidates: ScheduleCandidate[];
    excludeScheduleIds?: number[];
  },
) {
  const maxCount = await getMaxConcurrentStudents(client, { organizationId });

  if (candidates.length === 0) {
    return validateScheduleCandidatesAgainstExisting([], [], maxCount);
  }

  const earliestStart = new Date(
    Math.min(...candidates.map((candidate) => candidate.startTime.getTime())),
  );
  const latestEnd = new Date(
    Math.max(...candidates.map((candidate) => candidate.endTime.getTime())),
  );

  const data = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select("schedule_id, student_id, start_time, end_time")
      .eq("organization_id", organizationId)
      .lt("start_time", latestEnd.toISOString())
      .gt("end_time", earliestStart.toISOString())
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );

  const excludedIds = new Set(excludeScheduleIds);
  const existingSchedules = (data ?? [])
    .filter((schedule) => !excludedIds.has(schedule.schedule_id))
    .map((schedule) => ({
      scheduleId: schedule.schedule_id,
      studentId: schedule.student_id,
      startTime: new Date(schedule.start_time),
      endTime: new Date(schedule.end_time),
    }));

  return validateScheduleCandidatesAgainstExisting(
    candidates,
    existingSchedules,
    maxCount,
  );
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
  { studentId, organizationId }: { studentId: string; organizationId?: string },
) {
  const now = nowKST();
  const dayOfWeek = new Date(
    Date.UTC(now.year, now.month, now.day),
  ).getUTCDay();
  const startOfWeek = fromKST(now.year, now.month, now.day - dayOfWeek);
  const endOfWeek = fromKST(now.year, now.month, now.day - dayOfWeek + 7);
  return getStudentSchedules(client, {
    studentId,
    organizationId,
    startDate: startOfWeek,
    endDate: endOfWeek,
    endExclusive: true,
  });
}

/**
 * Calculate total class hours for a student
 * Uses an RLS-protected SQL aggregate instead of downloading schedule history.
 */
export async function calculateStudentTotalHours(
  client: SupabaseClient<Database>,
  { studentId, organizationId }: { studentId: string; organizationId?: string },
): Promise<number> {
  const totals = await getStudentHoursTotals(client, {
    studentIds: [studentId],
    organizationId,
  });
  return totals[studentId] ?? 0;
}

/**
 * Get next week's schedules for a student
 */
export async function getStudentNextWeekSchedules(
  client: SupabaseClient<Database>,
  { studentId, organizationId }: { studentId: string; organizationId?: string },
) {
  const now = nowKST();
  const dayOfWeek = new Date(
    Date.UTC(now.year, now.month, now.day),
  ).getUTCDay();

  // Start of next week (next Sunday) in KST
  const startOfNextWeek = fromKST(now.year, now.month, now.day - dayOfWeek + 7);

  // End of next week (next Saturday) in KST
  const endOfNextWeek = fromKST(now.year, now.month, now.day - dayOfWeek + 14);
  return getStudentSchedules(client, {
    studentId,
    organizationId,
    startDate: startOfNextWeek,
    endDate: endOfNextWeek,
    endExclusive: true,
  });
}

/**
 * Get monthly hours for a student (for yearly chart)
 * Returns hours grouped by month for the given year
 */
export async function getStudentYearlyStats(
  client: SupabaseClient<Database>,
  { studentId, year }: { studentId: string; year: number },
): Promise<{ month: number; hours: number }[]> {
  const startDate = getKSTMonthRange(year, 1).startDate;
  const endDate = getKSTMonthRange(year, 12).endDate;
  const now = new Date().toISOString();
  const data = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select("start_time, end_time")
      .eq("student_id", studentId)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString())
      .lte("end_time", now)
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );

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
    const month = toKST(start).month + 1;
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
  const now = nowKST();
  const thisMonthStart = fromKST(now.year, now.month, 1);
  const lastMonthStart = fromKST(now.year, now.month - 1, 1);
  const currentTime = new Date().toISOString();
  const schedules = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select("start_time, end_time")
      .eq("student_id", studentId)
      .gte("start_time", lastMonthStart.toISOString())
      .lte("end_time", currentTime)
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );
  const thisMonth = schedules.filter(
    (schedule) => new Date(schedule.start_time) >= thisMonthStart,
  );
  const lastMonth = schedules.filter(
    (schedule) => new Date(schedule.start_time) < thisMonthStart,
  );

  const calculateHours = (
    schedules: { start_time: string; end_time: string }[],
  ) => {
    return schedules.reduce((sum, s) => {
      const start = new Date(s.start_time);
      const end = new Date(s.end_time);
      return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }, 0);
  };

  return {
    thisMonthHours: Math.round(calculateHours(thisMonth) * 10) / 10,
    lastMonthHours: Math.round(calculateHours(lastMonth) * 10) / 10,
    thisMonthCount: thisMonth.length,
    lastMonthCount: lastMonth.length,
  };
}

/**
 * Get student's learning streak (consecutive days with schedules)
 */
export async function getStudentStreak(
  client: SupabaseClient<Database>,
  { studentId }: { studentId: string },
): Promise<number> {
  const now = new Date().toISOString();
  return getCurrentScheduleStreak((from, to) =>
    client
      .from("schedules")
      .select("start_time")
      .eq("student_id", studentId)
      .lte("end_time", now)
      .order("start_time", { ascending: false })
      .order("schedule_id", { ascending: false })
      .range(from, to),
  );
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
 * Get program-wise hours breakdown for a student
 * Returns hours grouped by program for the given year
 */
export async function getStudentProgramHoursBreakdown(
  client: SupabaseClient<Database>,
  { studentId, year }: { studentId: string; year: number },
): Promise<
  {
    programId: number | null;
    programTitle: string;
    hours: number;
    color: string;
  }[]
> {
  const startDate = getKSTMonthRange(year, 1).startDate;
  const endDate = getKSTMonthRange(year, 12).endDate;
  const now = new Date().toISOString();
  const data = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select(
        `
      start_time,
      end_time,
      program_id,
      program:programs!schedules_program_id_programs_program_id_fk(
        program_id,
        title
      )
    `,
      )
      .eq("student_id", studentId)
      .gte("start_time", startDate.toISOString())
      .lt("start_time", endDate.toISOString())
      .lte("end_time", now)
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );

  const programColors = [
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#f97316", // orange
    "#10b981", // emerald
    "#06b6d4", // cyan
  ];

  const programHours: Record<
    string,
    { programId: number | null; programTitle: string; hours: number }
  > = {};

  for (const schedule of data || []) {
    const start = new Date(schedule.start_time);
    const end = new Date(schedule.end_time);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    const programId = schedule.program_id;
    const programTitle = schedule.program?.title || "미지정";
    const key = programId?.toString() || "null";

    if (!programHours[key]) {
      programHours[key] = { programId, programTitle, hours: 0 };
    }
    programHours[key].hours += hours;
  }

  return Object.values(programHours)
    .map((item, index) => ({
      ...item,
      hours: Math.round(item.hours * 10) / 10,
      color: programColors[index % programColors.length],
    }))
    .sort((a, b) => b.hours - a.hours);
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
    .select("schedule_id")
    .eq("student_id", studentId)
    .lt("start_time", endTime.toISOString())
    .gt("end_time", startTime.toISOString());

  if (excludeScheduleId) {
    query = query.neq("schedule_id", excludeScheduleId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}
