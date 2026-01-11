import type { Route } from "./+types/dashboard";

import {
  CalendarIcon,
  ClockIcon,
  CalendarDaysIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  FlameIcon,
  TargetIcon,
} from "lucide-react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { Button } from "~/core/components/ui/button";
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
  getStudentSchedules,
  calculateStudentTotalHours,
  getStudentYearlyStats,
  getStudentMonthlyStats,
  getStudentClassDates,
} from "~/features/schedules/queries";

export const meta: Route.MetaFunction = () => {
  return [{ title: `대시보드 | ${import.meta.env.VITE_APP_NAME}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      thisMonthCount: 0,
      totalHours: 0,
      nextSchedule: null,
      upcomingSchedules: [],
      yearlyStats: [],
      monthlyStats: {
        thisMonthHours: 0,
        lastMonthHours: 0,
        thisMonthCount: 0,
        lastMonthCount: 0,
      },
      classDates: { classStartDate: null, classEndDate: null },
      daysRemaining: null,
    };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    schedules,
    totalHours,
    yearlyStats,
    monthlyStats,
    classDates,
  ] = await Promise.all([
    getStudentSchedules(client, { studentId: user.id, year, month }),
    calculateStudentTotalHours(client, { studentId: user.id }),
    getStudentYearlyStats(client, { studentId: user.id, year }),
    getStudentMonthlyStats(client, { studentId: user.id }),
    getStudentClassDates(client, { studentId: user.id }),
  ]);

  // 다가오는 일정 (현재 시간 이후)
  const upcomingSchedules = schedules
    .filter((s) => new Date(s.start_time) > now)
    .slice(0, 5);

  // 다음 일정
  const nextSchedule = upcomingSchedules[0] || null;

  // 남은 수업일 계산
  let daysRemaining: number | null = null;
  if (classDates.classEndDate) {
    const endDate = new Date(classDates.classEndDate);
    const diffTime = endDate.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) daysRemaining = 0;
  }

  return {
    thisMonthCount: schedules.filter((s) => new Date(s.start_time) > now).length,
    totalHours: Math.round(totalHours * 10) / 10,
    nextSchedule,
    upcomingSchedules,
    yearlyStats,
    monthlyStats,
    classDates,
    daysRemaining,
  };
}

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const {
    thisMonthCount,
    totalHours,
    nextSchedule,
    upcomingSchedules,
    yearlyStats,
    monthlyStats,
    daysRemaining,
  } = loaderData;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 월간 변화율 계산
  const monthlyChange = monthlyStats.lastMonthHours > 0
    ? Math.round(((monthlyStats.thisMonthHours - monthlyStats.lastMonthHours) / monthlyStats.lastMonthHours) * 100)
    : monthlyStats.thisMonthHours > 0 ? 100 : 0;

  // 차트 데이터 변환
  const chartData = yearlyStats.map((stat) => ({
    name: MONTH_NAMES[stat.month - 1],
    hours: stat.hours,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 수강시간</CardTitle>
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}시간</div>
            <p className="text-xs text-muted-foreground">
              누적 수업 시간
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 학습</CardTitle>
            {monthlyChange >= 0 ? (
              <TrendingUpIcon className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDownIcon className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyStats.thisMonthHours}시간</div>
            <p className="text-xs text-muted-foreground">
              {monthlyChange >= 0 ? "+" : ""}{monthlyChange}% 전월 대비
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">이번 달 남은 수업</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{thisMonthCount}회</div>
            <p className="text-xs text-muted-foreground">
              예정된 수업
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수업 종료까지</CardTitle>
            <TargetIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {daysRemaining !== null ? `${daysRemaining}일` : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              남은 기간
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        {/* 연간 학습 그래프 */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>연간 학습 현황</CardTitle>
            <CardDescription>
              {new Date().getFullYear()}년 월별 학습 시간
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}h`}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">
                                {payload[0].payload.name}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {payload[0].value}시간
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="hours"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 다음 수업 & 통계 */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>다음 수업</CardTitle>
            <CardDescription>예정된 다음 수업</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextSchedule ? (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <CalendarDaysIcon className="h-10 w-10 text-primary" />
                  <div>
                    <div className="font-semibold">
                      {formatDate(nextSchedule.start_time)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatTime(nextSchedule.start_time)} - {formatTime(nextSchedule.end_time)}
                    </div>
                    {nextSchedule.program?.title && (
                      <div className="text-sm text-muted-foreground">
                        {nextSchedule.program.title}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CalendarIcon className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  예정된 수업이 없습니다
                </p>
              </div>
            )}

            {/* 학습 비교 */}
            <div className="space-y-3 pt-4 border-t">
              <h4 className="text-sm font-medium">월간 비교</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">이번 달</p>
                  <p className="text-lg font-semibold">{monthlyStats.thisMonthHours}시간</p>
                  <p className="text-xs text-muted-foreground">{monthlyStats.thisMonthCount}회 수업</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">지난 달</p>
                  <p className="text-lg font-semibold">{monthlyStats.lastMonthHours}시간</p>
                  <p className="text-xs text-muted-foreground">{monthlyStats.lastMonthCount}회 수업</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 다가오는 수업 */}
      <Card>
        <CardHeader>
          <CardTitle>다가오는 수업</CardTitle>
          <CardDescription>앞으로 예정된 수업 일정입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingSchedules.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>요일</TableHead>
                  <TableHead>클래스</TableHead>
                  <TableHead>시간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingSchedules.map((schedule) => {
                  const date = new Date(schedule.start_time);
                  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][
                    date.getDay()
                  ];
                  return (
                    <TableRow key={schedule.schedule_id}>
                      <TableCell>
                        {date.toLocaleDateString("ko-KR", {
                          month: "long",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell
                        className={
                          date.getDay() === 0
                            ? "text-red-500"
                            : date.getDay() === 6
                              ? "text-blue-500"
                              : ""
                        }
                      >
                        {dayOfWeek}요일
                      </TableCell>
                      <TableCell>{schedule.program?.title || "-"}</TableCell>
                      <TableCell>
                        {formatTime(schedule.start_time)} -{" "}
                        {formatTime(schedule.end_time)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CalendarIcon className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">
                예정된 수업이 없습니다.
              </p>
              <Button asChild className="mt-4">
                <Link to="/my-schedules">일정 등록하기</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 바로가기 버튼 */}
      <div className="flex gap-4">
        <Button asChild variant="outline" className="flex-1">
          <Link to="/my-schedules/list">
            <CalendarIcon className="mr-2 h-4 w-4" />
            일정 목록 보기
          </Link>
        </Button>
        <Button asChild className="flex-1">
          <Link to="/my-schedules">
            <CalendarDaysIcon className="mr-2 h-4 w-4" />
            캘린더에서 등록하기
          </Link>
        </Button>
      </div>
    </div>
  );
}
