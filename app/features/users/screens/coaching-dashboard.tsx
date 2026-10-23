import type { Route } from "./+types/coaching-dashboard";

import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import { getStudentLearningHome } from "~/features/schedules/utils/student-learning.server";
import { LearningHome } from "~/features/users/components/coaching/learning-home";
import { getUserProfile } from "~/features/users/queries";

export const meta: Route.MetaFunction = () => [
  { title: `학습 홈 | ${import.meta.env.VITE_APP_NAME}` },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401 });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403 });
  const now = new Date();
  const learning = await getStudentLearningHome(
    client,
    profile.profile_id,
    now,
  );
  return data(
    {
      ...learning,
      profileId: profile.profile_id,
      name: profile.name,
      classStartDate: profile.class_start_date,
      classEndDate: profile.class_end_date,
      now: now.toISOString(),
    },
    { headers },
  );
}

export default function CoachingDashboard({
  loaderData,
}: Route.ComponentProps) {
  return <LearningHome {...loaderData} />;
}
