import type { Route } from "./+types/dashboard";

import { Link } from "react-router";
import { CalendarIcon, UsersIcon, GraduationCapIcon, CalendarDaysIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { getMonthlySchedules } from "~/features/schedules/queries";

import AdminCalendar from "../components/admin-calendar";
import { requireAdminRole } from "../guards.server";
import { getDashboardStats } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [stats, schedules] = await Promise.all([
    getDashboardStats(client, { organizationId }),
    getMonthlySchedules(client, { organizationId, year, month }),
  ]);

  // Transform schedules to calendar events
  const events = schedules.map((schedule) => {
    const studentName = schedule.student?.name || "알 수 없음";
    const programName = schedule.program?.title || null;
    const studentColor = schedule.student?.color || "#3B82F6";

    return {
      id: String(schedule.schedule_id),
      title: studentName,
      start: schedule.start_time,
      end: schedule.end_time,
      backgroundColor: `${studentColor}20`,
      borderColor: studentColor,
      textColor: "inherit",
      extendedProps: {
        studentId: schedule.student_id,
        scheduleId: schedule.schedule_id,
        programId: schedule.program_id,
        studentName,
        programName,
        studentColor,
      },
    };
  });

  return { stats, events };
}

export default function AdminDashboardScreen({
  loaderData,
}: Route.ComponentProps) {
  const { stats, events } = loaderData;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground">
          Lestly 관리자 대시보드입니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 수강생</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStudents}명</div>
            <p className="text-xs text-muted-foreground">
              <Link to="/admin/students" className="hover:underline">
                수강생 관리 →
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">정상 수강생</CardTitle>
            <UsersIcon className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeStudents}명</div>
            <p className="text-xs text-muted-foreground">
              현재 수업 중인 수강생
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">졸업 수강생</CardTitle>
            <GraduationCapIcon className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.graduatedStudents}명</div>
            <p className="text-xs text-muted-foreground">
              졸업 처리된 수강생
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘의 수업</CardTitle>
            <CalendarDaysIcon className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayScheduleCount}건</div>
            <p className="text-xs text-muted-foreground">
              <Link to="/admin/today" className="hover:underline">
                오늘의 수업 보기 →
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            이번 달 일정
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AdminCalendar events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
