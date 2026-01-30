import type { Route } from "./+types/dashboard";

import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Building2Icon,
  UsersIcon,
  CalendarIcon,
  TrendingUpIcon,
} from "lucide-react";

import { Badge } from "~/core/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import makeServerClient from "~/core/lib/supa-client.server";

import {
  getAllOrganizations,
  getGlobalStats,
  requireSuperAdmin,
} from "~/features/admin/guards.server";
import adminClient from "~/core/lib/supa-admin-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);

  // Check super admin role
  await requireSuperAdmin(client);

  // Get global stats
  const stats = await getGlobalStats();

  // Get all organizations with member counts
  const organizations = await getAllOrganizations();

  // Get member counts and notification settings per organization
  const orgStats = await Promise.all(
    organizations.map(async (org) => {
      const [{ count: memberCount }, { count: scheduleCount }, notifSetting] =
        await Promise.all([
          adminClient
            .from("organization_members")
            .select("profile_id", { count: "exact", head: true })
            .eq("organization_id", org.organization_id),
          adminClient
            .from("schedules")
            .select("schedule_id", { count: "exact", head: true })
            .eq("organization_id", org.organization_id),
          adminClient
            .from("settings")
            .select("setting_value")
            .eq("organization_id", org.organization_id)
            .eq("setting_key", "notifications_enabled")
            .single(),
        ]);

      const notificationsEnabled =
        (notifSetting.data?.setting_value as { value?: boolean } | null)
          ?.value ?? false;

      return {
        ...org,
        memberCount: memberCount ?? 0,
        scheduleCount: scheduleCount ?? 0,
        notificationsEnabled,
      };
    })
  );

  return { stats, organizations: orgStats };
}

export default function SuperAdminDashboardScreen({
  loaderData,
}: Route.ComponentProps) {
  const { t } = useTranslation();
  const { stats, organizations } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("superAdmin.title")}</h1>
        <p className="text-muted-foreground">{t("superAdmin.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.stats.totalOrganizations")}
            </CardTitle>
            <Building2Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.stats.registeredOrganizations")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.stats.totalMembers")}
            </CardTitle>
            <UsersIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMembers}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.stats.acrossAllOrganizations")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.stats.totalSchedules")}
            </CardTitle>
            <CalendarIcon className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSchedules}</div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.stats.allTimeSchedules")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("superAdmin.stats.avgMembers")}
            </CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.totalOrganizations > 0
                ? Math.round(stats.totalMembers / stats.totalOrganizations)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("superAdmin.stats.perOrganization")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2Icon className="h-5 w-5" />
            {t("superAdmin.organizations")}
          </CardTitle>
          <CardDescription>{t("superAdmin.table.selectToManage")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("superAdmin.table.name")}</TableHead>
                <TableHead>{t("superAdmin.table.description")}</TableHead>
                <TableHead className="text-right">
                  {t("superAdmin.table.members")}
                </TableHead>
                <TableHead className="text-right">
                  {t("superAdmin.table.schedules")}
                </TableHead>
                <TableHead className="text-center">알림</TableHead>
                <TableHead className="text-right">
                  {t("superAdmin.table.created")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.organization_id}>
                  <TableCell>
                    <Link
                      to={`/super-admin/org/${org.organization_id}`}
                      className="font-medium hover:underline"
                    >
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {org.description || "-"}
                  </TableCell>
                  <TableCell className="text-right">{org.memberCount}</TableCell>
                  <TableCell className="text-right">
                    {org.scheduleCount}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={org.notificationsEnabled ? "default" : "secondary"}>
                      {org.notificationsEnabled ? "사용" : "미사용"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
              {organizations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    {t("superAdmin.table.noOrganizationsFound")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
