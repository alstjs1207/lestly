import type { Route } from "./+types/org-dashboard";

import {
  ArrowLeftIcon,
  BellIcon,
  CalendarDaysIcon,
  CalendarIcon,
  GraduationCapIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { requireMethod } from "~/core/lib/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import AdminCalendar from "~/features/admin/components/admin-calendar";
import { requireSuperAdmin } from "~/features/admin/guards.server";
import { getMonthlySchedules } from "~/features/schedules/queries";
import { fromKST, nowKST } from "~/features/schedules/utils/kst";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
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

  const now = nowKST();
  const today = fromKST(now.year, now.month, now.day);
  const tomorrow = fromKST(now.year, now.month, now.day + 1);
  const [counts, { data: notifSetting, error: settingsError }, schedules] =
    await Promise.all([
      Promise.all([
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
          .is("cancelled_at", null)
          .eq("organization_id", orgId)
          .gte("start_time", today.toISOString())
          .lt("start_time", tomorrow.toISOString()),
      ]),
      adminClient
        .from("settings")
        .select("setting_value")
        .eq("organization_id", orgId)
        .eq("setting_key", "notifications_enabled")
        .maybeSingle(),
      getMonthlySchedules(adminClient, {
        organizationId: orgId,
        year: now.year,
        month: now.month + 1,
      }),
    ]);

  for (const result of counts) {
    if (result.error) throw result.error;
  }
  if (settingsError) throw settingsError;
  const [
    { count: totalStudents },
    { count: activeStudents },
    { count: graduatedStudents },
    { count: todayScheduleCount },
  ] = counts;
  const notificationsEnabled =
    (notifSetting?.setting_value as { value?: boolean } | null)?.value === true;

  const stats = {
    totalStudents: totalStudents ?? 0,
    activeStudents: activeStudents ?? 0,
    graduatedStudents: graduatedStudents ?? 0,
    todayScheduleCount: todayScheduleCount ?? 0,
  };

  const events = schedules.map((schedule) => ({
    id: String(schedule.schedule_id),
    title: schedule.student?.name || "Unknown",
    start: schedule.start_time,
    end: schedule.end_time,
    backgroundColor: schedule.student?.color || "#3B82F6",
    borderColor: schedule.student?.color || "#3B82F6",
    extendedProps: {
      studentId: schedule.student_id,
      scheduleId: schedule.schedule_id,
    },
  }));

  return data(
    { organization, stats, events, notificationsEnabled },
    { headers },
  );
}

export async function action({ request, params }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client] = makeServerClient(request);
  const { orgId } = params;

  await requireSuperAdmin(client);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "toggleNotifications") {
    const enabled = formData.get("enabled") === "true";

    await adminClient.from("settings").upsert({
      organization_id: orgId,
      setting_key: "notifications_enabled",
      setting_value: { value: enabled },
    });

    return { success: true };
  }

  return { success: false };
}

export default function OrgDashboardScreen({
  loaderData,
}: Route.ComponentProps) {
  const { t } = useTranslation();
  const { organization, stats, events, notificationsEnabled } = loaderData;
  const fetcher = useFetcher();

  const isToggling = fetcher.state !== "idle";
  const optimisticEnabled = isToggling
    ? fetcher.formData?.get("enabled") === "true"
    : notificationsEnabled;

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
        <div className="ml-auto">
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="toggleNotifications" />
            <input
              type="hidden"
              name="enabled"
              value={String(!optimisticEnabled)}
            />
            <Button
              type="submit"
              variant={optimisticEnabled ? "destructive" : "default"}
              disabled={isToggling}
            >
              <BellIcon className="mr-2 h-4 w-4" />
              {optimisticEnabled ? "알림 비활성화" : "알림 활성화"}
            </Button>
          </fetcher.Form>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.orgDashboard.totalStudents")}
            </CardTitle>
            <UsersIcon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}</div>
            <p className="text-muted-foreground text-xs">
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
            <p className="text-muted-foreground text-xs">
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
            <p className="text-muted-foreground text-xs">
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
            <p className="text-muted-foreground text-xs">
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
