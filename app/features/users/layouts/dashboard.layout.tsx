import type { Route } from "./+types/dashboard.layout";

import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import { getUserOrganizations } from "~/features/organizations/queries";
import { getUserProfile } from "~/features/users/queries";

import { StudentDashboardShell } from "../components/student-dashboard-shell";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const user = await getSessionUser(client);

  // 사용자의 조직 정보 조회
  let organizationName = null;
  let profileName = "";
  if (user) {
    const profile = await getUserProfile(client, { userId: user.id });
    profileName = profile?.name ?? "";
    const orgs = await getUserOrganizations(client, {
      profileId: profile?.profile_id || user.id,
    });
    if (orgs.length > 0 && orgs[0].organizations) {
      organizationName = orgs[0].organizations.name;
    }
  }

  return {
    user,
    organizationName,
    profileName,
  };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { user, organizationName, profileName } = loaderData;
  return (
    <StudentDashboardShell
      organizationName={organizationName}
      user={{
        name: profileName || user?.user_metadata.name || "수강생",
        avatarUrl: user?.user_metadata.avatar_url || "",
        email: user?.email,
      }}
    />
  );
}
