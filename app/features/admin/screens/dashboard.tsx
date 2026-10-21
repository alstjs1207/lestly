import type { Route } from "./+types/dashboard";

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  Clock3Icon,
  PencilIcon,
  PhoneIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { EmptyState } from "~/core/components/ui/empty-state";
import makeServerClient from "~/core/lib/supa-client.server";
import { getUpcomingSchedules } from "~/features/schedules/queries";
import { toKSTDateString } from "~/features/schedules/utils/kst";

import { AdminSetupChecklist } from "../components/admin-setup-checklist";
import { requireAdminRole } from "../guards.server";
import { getDashboardStats } from "../queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  const [stats, schedules] = await Promise.all([
    getDashboardStats(client, { organizationId }),
    getUpcomingSchedules(client, { organizationId, days: 14 }),
  ]);

  const now = new Date();
  const todayKey = toKSTDateString(now);
  const todaySchedules = schedules.filter(
    (schedule) => toKSTDateString(new Date(schedule.start_time)) === todayKey,
  );
  const upcomingSchedules = schedules
    .filter(
      (schedule) =>
        toKSTDateString(new Date(schedule.start_time)) !== todayKey &&
        new Date(schedule.end_time) >= now,
    )
    .slice(0, 8);

  return {
    stats,
    todaySchedules,
    upcomingSchedules,
    today: now.toISOString(),
  };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhoneHref(phone: string) {
  return `tel:${phone.replace(/\D/g, "")}`;
}

export default function AdminDashboardScreen({
  loaderData,
}: Route.ComponentProps) {
  const { stats, todaySchedules, upcomingSchedules, today } = loaderData;
  const todayDate = new Date(today);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-2 rounded-full">
            오늘의 운영
          </Badge>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">
            {todayDate.toLocaleDateString("ko-KR", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            오늘 수업과 다음 일정을 한눈에 확인하세요.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" className="min-h-11" asChild>
            <Link to="/admin/students/new">
              <UserPlusIcon className="size-4" />
              수강생 등록
            </Link>
          </Button>
          <Button className="min-h-11" asChild>
            <Link to="/admin/schedules/new">
              <CalendarPlusIcon className="size-4" />
              일정 등록
            </Link>
          </Button>
        </div>
      </div>

      <AdminSetupChecklist
        hasStudent={stats.totalStudents > 0}
        hasProgram={stats.activeProgramCount > 0}
        hasSchedule={stats.totalScheduleCount > 0}
      />

      <div className="grid grid-cols-2 gap-2 md:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 md:pb-2">
            <CardTitle className="text-sm font-medium">오늘 수업</CardTitle>
            <CalendarDaysIcon className="text-primary size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold md:text-2xl">
              {stats.todayScheduleCount}건
            </div>
            <p className="text-muted-foreground hidden text-xs md:block">
              오늘 예정된 전체 일정
            </p>
          </CardContent>
        </Card>

        <Link to="/admin/students">
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 md:pb-2">
              <CardTitle className="text-sm font-medium">정상 수강생</CardTitle>
              <UsersIcon className="size-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold md:text-2xl">
                {stats.activeStudents}명
              </div>
              <p className="text-muted-foreground hidden text-xs md:block">
                현재 수업 중인 수강생
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/schedules">
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 md:pb-2">
              <CardTitle className="text-sm font-medium">
                이번 달 수업
              </CardTitle>
              <Clock3Icon className="size-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold md:text-2xl">
                {stats.monthlyScheduleCount}건
              </div>
              <p className="text-muted-foreground hidden text-xs md:block">
                전체 일정 보기 →
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/students">
          <Card className="hover:bg-muted/50 h-full transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 md:pb-2">
              <CardTitle className="text-sm font-medium">전체 수강생</CardTitle>
              <UsersIcon className="text-muted-foreground size-4" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold md:text-2xl">
                {stats.totalStudents}명
              </div>
              <p className="text-muted-foreground hidden text-xs md:block">
                수강생 관리 →
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card id="today-schedules">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDaysIcon className="text-primary size-5" />
                오늘 수업
              </CardTitle>
              <CardDescription className="mt-1">
                예정된 수업 {todaySchedules.length}건
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="min-h-11" asChild>
              <Link to="/admin/schedules">
                전체 일정
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {todaySchedules.length === 0 ? (
              <EmptyState
                icon={CalendarDaysIcon}
                title="오늘 예정된 수업이 없습니다."
                description="새 일정을 등록하거나 다음 일정을 확인해 보세요."
                action={
                  <Button variant="outline" asChild>
                    <Link to="/admin/schedules/new">일정 등록</Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y">
                {todaySchedules.map((schedule) => (
                  <div
                    key={schedule.schedule_id}
                    className="flex min-h-20 items-center gap-3 py-3"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: schedule.student?.color || "#3B82F6",
                      }}
                    />
                    <div className="w-24 shrink-0 text-sm tabular-nums">
                      <p className="font-semibold">
                        {formatTime(schedule.start_time)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatTime(schedule.end_time)}까지
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/admin/students/${schedule.student?.profile_id}`}
                        className="truncate font-semibold hover:underline"
                      >
                        {schedule.student?.name || "알 수 없음"}
                      </Link>
                      <p className="text-muted-foreground truncate text-sm">
                        {schedule.program?.title || "클래스 미지정"}
                        {schedule.student?.region
                          ? ` · ${schedule.student.region}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {schedule.student?.phone && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-11"
                          asChild
                        >
                          <a
                            href={formatPhoneHref(schedule.student.phone)}
                            aria-label={`${schedule.student.name} 수강생에게 전화`}
                          >
                            <PhoneIcon className="size-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-11"
                        asChild
                      >
                        <Link
                          to={`/admin/schedules/${schedule.schedule_id}/edit`}
                          aria-label={`${schedule.student?.name || "수강생"} 일정 수정`}
                        >
                          <PencilIcon className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3Icon className="text-primary size-5" />
              다가오는 일정
            </CardTitle>
            <CardDescription>오늘 이후 14일간의 일정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingSchedules.length === 0 ? (
              <EmptyState
                icon={Clock3Icon}
                title="다가오는 일정이 없습니다."
                description="일정을 등록하면 앞으로 14일간의 수업이 여기에 표시됩니다."
                compact
              />
            ) : (
              <div className="divide-y">
                {upcomingSchedules.map((schedule) => {
                  const start = new Date(schedule.start_time);
                  return (
                    <Link
                      key={schedule.schedule_id}
                      to={`/admin/schedules/${schedule.schedule_id}/edit`}
                      className="hover:bg-muted/50 -mx-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition-colors"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: schedule.student?.color || "#3B82F6",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {schedule.student?.name || "알 수 없음"}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {schedule.program?.title || "클래스 미지정"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className="font-medium">
                          {start.toLocaleDateString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                            weekday: "short",
                          })}
                        </p>
                        <p className="text-muted-foreground">
                          {formatTime(schedule.start_time)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
