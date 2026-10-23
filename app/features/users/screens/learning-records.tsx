import type { Route } from "./+types/learning-records";

import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import {
  getKSTMonthRange,
  parseCalendarMonth,
} from "~/features/schedules/utils/calendar-month";
import { toKST } from "~/features/schedules/utils/kst";
import { getStudentLearningRecords } from "~/features/schedules/utils/student-learning.server";
import { getUserProfile } from "~/features/users/queries";

import { LearningRecords } from "../components/coaching/learning-records";

export const meta: Route.MetaFunction = () => [
  { title: `배움 기록 | ${import.meta.env.VITE_APP_NAME}` },
];
export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401 });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403 });
  const params = new URL(request.url).searchParams;
  const now = new Date();
  const { year, month } = parseCalendarMonth(params, now);
  const all = params.get("period") === "all";
  const records = await getStudentLearningRecords(
    client,
    profile.profile_id,
    all ? null : getKSTMonthRange(year, month),
    now,
  );
  const start = profile.class_start_date
    ? profile.class_start_date.slice(0, 7)
    : `${toKST(now).year - 1}-01`;
  return data(
    {
      ...records,
      profileId: profile.profile_id,
      now: now.toISOString(),
      year,
      month,
      all,
      firstMonth: start,
    },
    { headers },
  );
}
export default function LearningRecordsScreen({
  loaderData,
}: Route.ComponentProps) {
  return <LearningRecords {...loaderData} />;
}
