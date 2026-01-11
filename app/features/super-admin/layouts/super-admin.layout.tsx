import type { Route } from "./+types/super-admin.layout";

import { Outlet } from "react-router";

import LangSwitcher from "~/core/components/lang-switcher";
import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  getAllOrganizations,
  requireSuperAdmin,
} from "~/features/admin/guards.server";
import SuperAdminSidebar from "../components/super-admin-sidebar";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);

  // Check super admin role
  const superAdmin = await requireSuperAdmin(client);

  // Get user profile
  const { data: profile } = await client
    .from("profiles")
    .select("name, avatar_url")
    .eq("profile_id", superAdmin.user.id)
    .single();

  // Get all organizations for sidebar
  const organizations = await getAllOrganizations();

  return {
    user: {
      name: profile?.name ?? superAdmin.user.user_metadata?.name ?? "",
      email: superAdmin.user.email ?? "",
      avatarUrl:
        profile?.avatar_url ?? superAdmin.user.user_metadata?.avatar_url ?? "",
    },
    organizations,
  };
}

export default function SuperAdminLayout({ loaderData }: Route.ComponentProps) {
  const { user, organizations } = loaderData;

  return (
    <SidebarProvider>
      <SuperAdminSidebar user={user} organizations={organizations} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
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
