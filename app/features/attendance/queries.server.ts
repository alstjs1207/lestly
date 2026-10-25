import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "../../core/lib/query-utils.ts";
import { type AttendanceChange, attendanceDate } from "./lib/attendance.ts";

export async function getAttendanceSchedules(
  client: SupabaseClient<Database>,
  {
    organizationId,
    date,
    pendingOnly,
    page,
    now = new Date(),
  }: {
    organizationId: string;
    date: string;
    pendingOnly: boolean;
    page: number;
    now?: Date;
  },
) {
  const start = new Date(`${attendanceDate(date)}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 86400000);
  let query = client
    .from("schedules")
    .select(
      `schedule_id, student_id, program_id, start_time, end_time,
    attendance_status, attendance_version, attendance_updated_at, cancelled_at,
    student:profiles!schedules_student_id_profiles_profile_id_fk(name),
    program:programs!schedules_program_id_programs_program_id_fk(title,instructor:instructors!programs_instructor_id_instructors_instructor_id_fk(name))`,
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("start_time")
    .order("schedule_id");
  // Pending view deliberately searches all started lessons, not only today.
  if (pendingOnly)
    query = query
      .eq("attendance_status", "PENDING")
      .lte("start_time", now.toISOString());
  else
    query = query
      .gte("start_time", start.toISOString())
      .lt("start_time", end.toISOString());
  const { data, error, count } = await query.range(
    (page - 1) * 50,
    page * 50 - 1,
  );
  if (error) throw error;
  return { schedules: data ?? [], totalCount: count ?? 0 };
}

export async function saveAttendance(
  client: SupabaseClient<Database>,
  organizationId: string,
  changes: AttendanceChange[],
) {
  const { data, error } = await client.rpc("save_attendance", {
    p_organization_id: organizationId,
    p_changes: changes.map((change) => ({ ...change })),
  });
  if (error) throw error;
  return data;
}

export async function getAttendanceHistory(
  client: SupabaseClient<Database>,
  organizationId: string,
  scheduleId: number,
) {
  return fetchAllRows((from, to) =>
    client
      .from("attendance_events")
      .select("event_id,version,previous_status,status,actor_name,recorded_at")
      .eq("organization_id", organizationId)
      .eq("schedule_id", scheduleId)
      .order("version", { ascending: false })
      .range(from, to),
  );
}
