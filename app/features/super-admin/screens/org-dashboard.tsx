import type { Route } from "./+types/org-dashboard";

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  CalendarIcon,
  UsersIcon,
  GraduationCapIcon,
  CalendarDaysIcon,
  ArrowLeftIcon,
} from "lucide-react";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";

import AdminCalendar from "~/features/admin/components/admin-calendar";
import { requireSuperAdmin } from "~/features/admin/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { orgId } = params;

  // Check super admin role
  await requireSuperAdmin(client);

  // Get organization details
  const { data: organization } = await adminClient
    .from("organizations")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  if (!organization) {
    throw new Response("Organization not found", { status: 404 });
  }

  // Get stats for this organization
  const [
    { count: totalStudents },
    { count: activeStudents },
    { count: graduatedStudents },
    { count: todayScheduleCount },
  ] = await Promise.all([
    adminClient
      .from("organization_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("role", "STUDENT"),
    adminClient
      .from("organization_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("role", "STUDENT")
      .eq("state", "NORMAL"),
    adminClient
      .from("organization_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("role", "STUDENT")
      .eq("state", "GRADUATE"),
    adminClient
      .from("schedules")
      .select("schedule_id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("start_time", new Date().toISOString().split("T")[0])
      .lt(
        "start_time",
        new Date(Date.now() + 86400000).toISOString().split("T")[0]
      ),
  ]);

  const stats = {
    totalStudents: totalStudents ?? 0,
    activeStudents: activeStudents ?? 0,
    graduatedStudents: graduatedStudents ?? 0,
    todayScheduleCount: todayScheduleCount ?? 0,
  };

  // Get schedules for calendar (using admin client)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const { data: schedules } = await adminClient
    .from("schedules")
    .select(
      `
      schedule_id,
      start_time,
      end_time,
      student_id,
      profiles!schedules_student_id_fkey (
        name,
        color
      )
    `
    )
    .eq("organization_id", orgId)
    .gte("start_time", startDate.toISOString())
    .lte("start_time", endDate.toISOString())
    .order("start_time", { ascending: true });

  const events = (schedules ?? []).map((schedule: any) => ({
    id: String(schedule.schedule_id),
    title: schedule.profiles?.name || "Unknown",
    start: schedule.start_time,
    end: schedule.end_time,
    backgroundColor: schedule.profiles?.color || "#3B82F6",
    borderColor: schedule.profiles?.color || "#3B82F6",
    extendedProps: {
      studentId: schedule.student_id,
      scheduleId: schedule.schedule_id,
    },
  }));

  return { organization, stats, events };
}

export default function OrgDashboardScreen({
  loaderData,
}: Route.ComponentProps) {
  const { t } = useTranslation();
  const { organization, stats, events } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/super-admin">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{organization.name}</h1>
          <p className="text-muted-foreground">
            {organization.description ||
              t("superAdmin.orgDashboard.organizationDashboard")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.orgDashboard.totalStudents")}
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.orgDashboard.allStudents")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.orgDashboard.activeStudents")}
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeStudents}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.orgDashboard.currentlyEnrolled")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.orgDashboard.graduated")}
            </CardTitle>
            <GraduationCapIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.graduatedStudents}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.orgDashboard.completedProgram")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.orgDashboard.todaysClasses")}
            </CardTitle>
            <CalendarDaysIcon className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayScheduleCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.orgDashboard.scheduledToday")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {t("superAdmin.orgDashboard.thisMonthSchedule")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminCalendar events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
