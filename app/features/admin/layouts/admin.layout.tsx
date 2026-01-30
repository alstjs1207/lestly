import type { Route } from "./+types/admin.layout";

import { Outlet, redirect } from "react-router";

import LangSwitcher from "~/core/components/lang-switcher";
import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getNotificationsEnabled } from "~/features/app-settings/queries";
import { getOrganization } from "~/features/organizations/queries";

import { NotificationBell } from "~/features/notifications/components/notification-bell";

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

  // Get organization info and notifications setting
  const [organization, notificationsEnabled] = await Promise.all([
    getOrganization(client, { organizationId: adminUser.organizationId }),
    getNotificationsEnabled(adminClient, { organizationId: adminUser.organizationId }),
  ]);

  return {
    user: {
      name: profile?.name ?? adminUser.user.user_metadata?.name ?? "",
      email: adminUser.user.email ?? "",
      avatarUrl: profile?.avatar_url ?? adminUser.user.user_metadata?.avatar_url ?? "",
    },
    organizationId: adminUser.organizationId,
    organizationName: organization?.name ?? "조직",
    notificationsEnabled,
  };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <SidebarProvider>
      <AdminSidebar user={user} notificationsEnabled={loaderData.notificationsEnabled} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <span className="text-sm font-medium text-muted-foreground">
              {loaderData.organizationName}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            {loaderData.notificationsEnabled && (
              <NotificationBell organizationId={loaderData.organizationId} />
            )}
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
