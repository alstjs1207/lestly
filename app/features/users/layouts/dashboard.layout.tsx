import type { Route } from "./+types/dashboard.layout";

import { Outlet } from "react-router";

import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";
import makeServerClient, { getAuthUser } from "~/core/lib/supa-client.server";
import { getUserOrganizations } from "~/features/organizations/queries";

import DashboardSidebar from "../components/dashboard-sidebar";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const user = await getAuthUser(client);

  // 사용자의 조직 정보 조회
  let organizationName = null;
  if (user) {
    const orgs = await getUserOrganizations(client, { profileId: user.id });
    if (orgs.length > 0 && orgs[0].organizations) {
      organizationName = orgs[0].organizations.name;
    }
  }

  return {
    user,
    organizationName,
  };
}

export default function DashboardLayout({ loaderData }: Route.ComponentProps) {
  const { user, organizationName } = loaderData;
  return (
    <SidebarProvider>
      <DashboardSidebar
        user={{
          name: user?.user_metadata.name ?? "",
          avatarUrl: user?.user_metadata.avatar_url ?? "",
          email: user?.email ?? "",
        }}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            {organizationName && (
              <span className="font-semibold text-lg">{organizationName}</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            <ThemeSwitcher />
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
