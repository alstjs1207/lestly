import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "../../../core/lib/supa-client.server";
import { getActivePrograms } from "../../programs/queries";
import { getUserProfile } from "../../users/queries";
import { getKSTMonthRange, parseCalendarMonth } from "./calendar-month";
import { getLearningSchedules } from "./student-learning.server";
import { getStudentAllowedDateRange } from "./student-schedule-rules";

export async function loadStudentCalendar(request: Request) {
  const [client, headers] = makeServerClient(request);
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401 });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403 });
  const now = new Date();
  const params = new URL(request.url).searchParams;
  const { year, month } = parseCalendarMonth(params, now);
  const range = getKSTMonthRange(year, month);
  const allowed = getStudentAllowedDateRange();
  const { data: membership, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profile.profile_id)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .maybeSingle();
  if (error) throw error;
  const [schedules, programs] = await Promise.all([
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
  ]);
  return data(
    {
      schedules,
      programs,
      year,
      month,
      now: now.toISOString(),
      classStartDate: profile.class_start_date,
      classEndDate: profile.class_end_date,
      allowedStartDate: allowed.startDate.toISOString(),
      allowedEndDate: allowed.endDate.toISOString(),
      canBook: !!membership,
    },
    { headers },
  );
}
