import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "../../../core/lib/query-utils.ts";
import { fromKST, toKST } from "./kst.ts";
import {
  completedSchedules,
  learningHeatmap,
  sumScheduleHours,
} from "./learning-records.ts";
import { getStudentHoursTotals } from "./student-hours.ts";

export const learningScheduleSelect = `schedule_id, start_time, end_time, attendance_status, cancellation_policy,
  program:programs!schedules_program_id_programs_program_id_fk(
    program_id, title, location_address, location_type,
    instructor:instructors!programs_instructor_id_instructors_instructor_id_fk(name)
  )`;

export async function getLearningSchedules(
  client: SupabaseClient<Database>,
  {
    studentId,
    startDate,
    endDate,
    completedBefore,
  }: {
    studentId: string;
    startDate?: Date;
    endDate?: Date;
    completedBefore?: Date;
  },
) {
  return fetchAllRows((from, to) => {
    let query = client
      .from("schedules")
      .select(learningScheduleSelect)
      .is("cancelled_at", null)
      .eq("student_id", studentId)
      .order("start_time", { ascending: false })
      .order("schedule_id", { ascending: false });
    if (startDate) query = query.gte("start_time", startDate.toISOString());
    if (endDate) query = query.lt("start_time", endDate.toISOString());
    if (completedBefore)
      query = query.lte("end_time", completedBefore.toISOString());
    return query.range(from, to);
  });
}

export async function getStudentLearningHome(
  client: SupabaseClient<Database>,
  studentId: string,
  now = new Date(),
) {
  const kst = toKST(now);
  const chartStart = fromKST(kst.year, kst.month - 2, 1);
  const monthStart = fromKST(kst.year, kst.month, 1);
  const nextMonth = fromKST(kst.year, kst.month + 1, 1);
  const [schedules, totals, nextResult] = await Promise.all([
    getLearningSchedules(client, {
      studentId,
      startDate: chartStart,
      endDate: nextMonth,
    }),
    getStudentHoursTotals(client, { studentIds: [studentId] }),
    client
      .from("schedules")
      .select(learningScheduleSelect)
      .is("cancelled_at", null)
      .eq("student_id", studentId)
      .gt("end_time", now.toISOString())
      .order("start_time", { ascending: true })
      .order("schedule_id", { ascending: true })
      .limit(1),
  ]);
  if (nextResult.error) throw nextResult.error;
  const completed = completedSchedules(schedules, now);
  const thisMonth = completed.filter(
    (s) => new Date(s.start_time) >= monthStart,
  );
  return {
    totalHours: totals[studentId] ?? 0,
    thisMonthHours: sumScheduleHours(thisMonth),
    thisMonthCount: thisMonth.length,
    upcomingCount: schedules.filter(
      (s) =>
        new Date(s.start_time) > now && new Date(s.start_time) >= monthStart,
    ).length,
    nextSchedule: nextResult.data?.[0] ?? null,
    chart: Array.from({ length: 3 }, (_, index) => {
      const start = fromKST(kst.year, kst.month - 2 + index, 1);
      const end = fromKST(kst.year, kst.month - 1 + index, 1);
      return {
        month: toKST(start).month + 1,
        hours: sumScheduleHours(
          completed.filter(
            (s) =>
              new Date(s.start_time) >= start && new Date(s.start_time) < end,
          ),
        ),
      };
    }),
  };
}

export async function getStudentLearningRecords(
  client: SupabaseClient<Database>,
  studentId: string,
  period: { startDate: Date; endDate: Date } | null,
  now = new Date(),
) {
  const firstDay = learningHeatmap([], now)[0].date;
  const [schedules, recent, totals] = await Promise.all([
    getLearningSchedules(client, {
      studentId,
      ...period,
      completedBefore: now,
    }),
    getLearningSchedules(client, {
      studentId,
      startDate: new Date(`${firstDay}T00:00:00+09:00`),
      completedBefore: now,
    }),
    getStudentHoursTotals(client, { studentIds: [studentId] }),
  ]);
  const ended = completedSchedules(schedules, now);
  return {
    schedules: ended,
    heatmap: learningHeatmap(recent, now),
    totalHours: totals[studentId] ?? 0,
    periodHours: sumScheduleHours(ended),
  };
}
