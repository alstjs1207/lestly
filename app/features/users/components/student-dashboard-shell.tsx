import type { ReactNode } from "react";

import { BookOpen, CalendarDays, Sprout, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router";

import ThemeSwitcher from "~/core/components/theme-switcher";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/core/components/ui/sidebar";

import DashboardSidebar from "./dashboard-sidebar";

export function StudentDashboardShell({
  user,
  organizationName,
  children,
}: {
  user: { name: string; avatarUrl: string; email?: string };
  organizationName: string | null;
  children?: ReactNode;
}) {
  return (
    <SidebarProvider>
      <DashboardSidebar user={user} />
      <SidebarInset className="min-w-0 bg-[#faf9fd] pb-20 md:pb-0 dark:bg-[#100e18]">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            {organizationName && (
              <span className="line-clamp-2 text-sm font-semibold md:text-lg">
                {organizationName}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 px-4">
            <ThemeSwitcher />
          </div>
        </header>
        {children ?? <Outlet />}
        <nav
          aria-label="수강생 주요 메뉴"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-violet-100 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-violet-900/40 dark:bg-[#191723]"
        >
          {[
            { to: "/dashboard", label: "학습 홈", icon: Sprout },
            { to: "/my-schedules", label: "나의 일정", icon: CalendarDays },
            { to: "/learning-records", label: "배움 기록", icon: BookOpen },
            { to: "/account", label: "내 정보", icon: UserRound },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${isActive ? "font-semibold text-violet-700 dark:text-violet-300" : "text-muted-foreground"}`
              }
            >
              <item.icon className="size-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
