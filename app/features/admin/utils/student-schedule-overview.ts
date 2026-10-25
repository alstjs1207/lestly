import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "../../../core/lib/query-utils.ts";
import { fromKST, toKST } from "../../schedules/utils/kst.ts";

/** All periods use KST and an exclusive end to include fractional seconds. */
export function getStudentSchedulePeriods(now = new Date()) {
  const { year, month, day } = toKST(now);
  const dayOfWeek = new Date(Date.UTC(year, month, day)).getUTCDay();
  const weekStart = fromKST(year, month, day - dayOfWeek);
  const nextWeekStart = fromKST(year, month, day - dayOfWeek + 7);
  const nextWeekEnd = fromKST(year, month, day - dayOfWeek + 14);
  const monthStart = fromKST(year, month, 1);
  const nextMonthStart = fromKST(year, month + 1, 1);
  const nextMonthEnd = fromKST(year, month + 2, 1);

  return {
    currentYear: year,
    currentMonth: month + 1,
    nextMonthYear: month === 11 ? year + 1 : year,
    nextMonth: month === 11 ? 1 : month + 2,
    weekStart,
    nextWeekStart,
    nextWeekEnd,
    monthStart,
    nextMonthStart,
    nextMonthEnd,
    queryStart: new Date(Math.min(+weekStart, +monthStart)),
    queryEnd: new Date(Math.max(+nextWeekEnd, +nextMonthEnd)),
  };
}

/** Fetch overlapping detail panels once, scoped to the selected organization. */
export async function getStudentScheduleOverview(
  client: SupabaseClient<Database>,
  {
    organizationId,
    studentId,
    now = new Date(),
  }: { organizationId: string; studentId: string; now?: Date },
) {
  const periods = getStudentSchedulePeriods(now);
  const schedules = await fetchAllRows((from, to) =>
    client
      .from("schedules")
      .select(
        `schedule_id, start_time, end_time,
        program:programs!schedules_program_id_programs_program_id_fk(program_id, title)`,
      )
      .is("cancelled_at", null)
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .gte("start_time", periods.queryStart.toISOString())
      .lt("start_time", periods.queryEnd.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true })
      .range(from, to),
  );

  const within = (start: Date, end: Date) =>
    schedules.filter((schedule) => {
      const time = Date.parse(schedule.start_time);
      return time >= +start && time < +end;
    });

  return {
    currentYear: periods.currentYear,
    currentMonth: periods.currentMonth,
    nextMonthYear: periods.nextMonthYear,
    nextMonth: periods.nextMonth,
    weeklySchedules: within(periods.weekStart, periods.nextWeekStart),
    nextWeekSchedules: within(periods.nextWeekStart, periods.nextWeekEnd),
    monthlySchedules: within(periods.monthStart, periods.nextMonthStart),
    nextMonthSchedules: within(periods.nextMonthStart, periods.nextMonthEnd),
  };
}
