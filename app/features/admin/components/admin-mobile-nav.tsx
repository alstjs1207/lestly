import {
  CalendarIcon,
  CalendarPlusIcon,
  ClipboardCheckIcon,
  HomeIcon,
  UsersIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";

const items = [
  {
    label: "홈",
    to: "/admin",
    icon: HomeIcon,
    isActive: (pathname: string) => pathname === "/admin",
  },
  {
    label: "일정",
    to: "/admin/schedules",
    icon: CalendarIcon,
    isActive: (pathname: string) =>
      pathname.startsWith("/admin/schedules") &&
      pathname !== "/admin/schedules/new",
  },
  {
    label: "출결",
    to: "/admin/attendance",
    icon: ClipboardCheckIcon,
    isActive: (pathname: string) => pathname.startsWith("/admin/attendance"),
  },
  {
    label: "등록",
    to: "/admin/schedules/new",
    icon: CalendarPlusIcon,
    isActive: (pathname: string) => pathname === "/admin/schedules/new",
  },
  {
    label: "수강생",
    to: "/admin/students",
    icon: UsersIcon,
    isActive: (pathname: string) => pathname.startsWith("/admin/students"),
  },
];

export default function AdminMobileNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="관리자 주요 메뉴"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="min-h-14"
          aria-current={item.isActive(pathname) ? "page" : undefined}
        >
          <span
            className={cn(
              "text-muted-foreground flex h-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors",
              item.isActive(pathname) && "text-primary",
            )}
          >
            <span
              className={cn(
                "flex h-8 min-w-14 items-center justify-center rounded-full transition-colors",
                item.isActive(pathname) && "bg-primary/15",
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
            </span>
            <span>{item.label}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
