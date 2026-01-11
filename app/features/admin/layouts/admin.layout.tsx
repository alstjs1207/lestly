import type { Route } from "./+types/admin.layout";

import { Outlet, redirect } from "react-router";

import LangSwitcher from "~/core/components/lang-switcher";
import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";
import makeServerClient from "~/core/lib/supa-client.server";
import { getOrganization } from "~/features/organizations/queries";

import AdminSidebar from "../components/admin-sidebar";
import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);

  // Check admin role
  const adminUser = await requireAdminRole(client);

  // Get user profile for sidebar
  const { data: profile } = await client
    .from("profiles")
    .select("name, avatar_url")
    .eq("profile_id", adminUser.user.id)
    .single();

  // Get organization info
  const organization = await getOrganization(client, { organizationId: adminUser.organizationId });

  return {
    user: {
      name: profile?.name ?? adminUser.user.user_metadata?.name ?? "",
      email: adminUser.user.email ?? "",
      avatarUrl: profile?.avatar_url ?? adminUser.user.user_metadata?.avatar_url ?? "",
    },
    organizationId: adminUser.organizationId,
    organizationName: organization?.name ?? "조직",
  };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <SidebarProvider>
      <AdminSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <span className="text-sm font-medium text-muted-foreground">
              {loaderData.organizationName}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            <ThemeSwitcher />
            <LangSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
