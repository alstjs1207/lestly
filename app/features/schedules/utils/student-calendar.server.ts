import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "../../../core/lib/supa-client.server";
import { DEFAULT_BOOKING_POLICY } from "../../app-settings/booking-policy";
import { getBookingPolicy } from "../../app-settings/booking-policy.server";
import { getDisabledBookingDays } from "../../app-settings/queries";
import { getActivePrograms } from "../../programs/queries";
import { getUserProfile } from "../../users/queries";
import { getKSTMonthRange, parseCalendarMonth } from "./calendar-month";
import { toKSTDateString } from "./kst";
import {
  getLearningSchedules,
  learningScheduleSelect,
} from "./student-learning.server";
import { getStudentAllowedDateRange } from "./student-schedule-rules";
import { parseStudentScheduleDate } from "./student-week";

export async function loadStudentCalendar(
  request: Request,
  { list = false } = {},
) {
  const [client, headers] = makeServerClient(request);
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401 });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403 });
  const now = new Date();
  const params = new URL(request.url).searchParams;
  const dateParams = new URLSearchParams(params);
  if (list) {
    dateParams.delete("date");
    dateParams.delete("book");
  }
  let selectedDate = parseStudentScheduleDate(dateParams, now);
  const { year, month } = list
    ? parseCalendarMonth(params, now)
    : {
        year: Number(selectedDate.slice(0, 4)),
        month: Number(selectedDate.slice(5, 7)),
      };
  const range = getKSTMonthRange(year, month);
  const { data: membership, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profile.profile_id)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .maybeSingle();
  if (error) throw error;
  const [schedules, programs, upcoming, disabledBookingDays, bookingPolicy] =
    await Promise.all([
      getLearningSchedules(client, {
        studentId: profile.profile_id,
        startDate: new Date(range.startDate.getTime() - 7 * 86_400_000),
        endDate: new Date(range.endDate.getTime() + 7 * 86_400_000),
      }),
      membership
        ? getActivePrograms(client, {
            organizationId: membership.organization_id,
          })
        : Promise.resolve([]),
      list
        ? Promise.resolve({ data: [], error: null })
        : client
            .from("schedules")
            .select(learningScheduleSelect)
            .is("cancelled_at", null)
            .eq("student_id", profile.profile_id)
            .gt("end_time", now.toISOString())
            .order("start_time", { ascending: true })
            .order("schedule_id", { ascending: true })
            .limit(1),
      membership
        ? getDisabledBookingDays(client, {
            organizationId: membership.organization_id,
          })
        : Promise.resolve([]),
      membership
        ? getBookingPolicy(client, {
            organizationId: membership.organization_id,
          })
        : Promise.resolve(DEFAULT_BOOKING_POLICY),
    ]);
  if (upcoming.error) throw upcoming.error;
  const allowed = getStudentAllowedDateRange(bookingPolicy, now);
  const requestedSchedule = schedules.find(
    (schedule) => String(schedule.schedule_id) === params.get("schedule"),
  );
  if (!list && requestedSchedule)
    selectedDate = toKSTDateString(new Date(requestedSchedule.start_time));
  return data(
    {
      schedules,
      disabledBookingDays,
      bookingPolicy,
      programs,
      year,
      month,
      now: now.toISOString(),
      selectedDate,
      nextSchedule: upcoming.data?.[0] ?? null,
      classStartDate: profile.class_start_date,
      classEndDate: profile.class_end_date,
      allowedStartDate: allowed.startDate.toISOString(),
      allowedEndDate: allowed.endDate.toISOString(),
      canBook:
        programs.length > 0 &&
        !!membership &&
        (!profile.class_end_date ||
          profile.class_end_date >= toKSTDateString(now)),
    },
    { headers },
  );
}
