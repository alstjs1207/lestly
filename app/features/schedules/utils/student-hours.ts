import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "../../../core/lib/query-utils.ts";

export async function getStudentHoursTotals(
  client: SupabaseClient<Database>,
  {
    studentIds,
    organizationId,
  }: { studentIds: string[]; organizationId?: string },
): Promise<Record<string, number>> {
  if (studentIds.length === 0) return {};

  const { data, error } = await client.rpc("get_student_completed_hours", {
    p_student_ids: studentIds,
    ...(organizationId && { p_organization_id: organizationId }),
  });

  if (!error) {
    return Object.fromEntries(
      (data ?? []).map((row) => [row.student_id, row.total_hours]),
    );
  }

  // Rolling deployments may serve the application before the completed-hours RPC exists.
  // Retain the same RLS-filtered result until migration 0021 is applied.
  if (error.code !== "PGRST202" && error.code !== "42883") throw error;
  const now = new Date().toISOString();
  const schedules = await fetchAllRows((from, to) => {
    let query = client
      .from("schedules")
      .select("student_id, start_time, end_time")
      .in("student_id", studentIds)
      .lte("end_time", now)
      .order("schedule_id", { ascending: true });
    if (organizationId) query = query.eq("organization_id", organizationId);
    return query.range(from, to);
  });

  const hours: Record<string, number> = {};
  for (const schedule of schedules) {
    const duration = Math.max(
      0,
      new Date(schedule.end_time).getTime() -
        new Date(schedule.start_time).getTime(),
    );
    hours[schedule.student_id] =
      (hours[schedule.student_id] ?? 0) + duration / 3_600_000;
  }
  return hours;
}
