import type { ShouldRevalidateFunctionArgs } from "react-router";

import type { Route } from "./+types/admin.layout";

import { Outlet, redirect } from "react-router";

import LangSwitcher from "~/core/components/lang-switcher";
import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";
import { getAuthenticatedProfile } from "~/core/lib/authenticated-profile.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getNotificationsEnabled } from "~/features/app-settings/queries";
import { NotificationBell } from "~/features/notifications/components/notification-bell";
import { getOrganization } from "~/features/organizations/queries";

import AdminMobileNav from "../components/admin-mobile-nav";
import AdminSidebar from "../components/admin-sidebar";
import { requireAdminRole } from "../guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);

  // Check admin role
  const adminUser = await requireAdminRole(client);

  // Get profile, organization, and notifications setting in parallel
  const [profile, organization, notificationsEnabled] = await Promise.all([
    getAuthenticatedProfile(client, adminUser.user.id),
    getOrganization(client, { organizationId: adminUser.organizationId }),
    getNotificationsEnabled(adminClient, {
      organizationId: adminUser.organizationId,
    }),
  ]);

  return {
    user: {
      name: profile?.name ?? adminUser.user.user_metadata?.name ?? "",
      email: adminUser.user.email,
      avatarUrl:
        profile?.avatar_url ?? adminUser.user.user_metadata?.avatar_url ?? "",
    },
    pushIdentity: `${adminUser.organizationId}:${adminUser.profileId}`,
    organizationId: adminUser.organizationId,
    organizationName: organization?.name ?? "조직",
    notificationsEnabled,
  };
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const isAdminNavigation =
    currentUrl.pathname.startsWith("/admin") &&
    nextUrl.pathname.startsWith("/admin");

  if (isAdminNavigation && (!formMethod || formMethod === "GET")) {
    return false;
  }

  return defaultShouldRevalidate;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <SidebarProvider>
      <AdminSidebar
        user={user}
        notificationsEnabled={loaderData.notificationsEnabled}
      />
      <SidebarInset>
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b backdrop-blur-md transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1 size-11 md:size-7" />
            <span className="text-muted-foreground text-sm font-medium">
              {loaderData.organizationName}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            {loaderData.notificationsEnabled && (
              <NotificationBell organizationId={loaderData.organizationId} />
            )}
            <ThemeSwitcher />
            <LangSwitcher disabled />
          </div>
        </header>
        <main className="bg-muted/20 flex-1 overflow-auto p-4 pb-24 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <AdminMobileNav />
    </SidebarProvider>
  );
}
