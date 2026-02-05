import type { Route } from "./+types/dashboard";

import {
  CalendarDaysIcon,
  CalendarIcon,
  ClockIcon,
  FlameIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
  calculateStudentTotalHours,
  getStudentClassDates,
  getStudentMonthlyStats,
  getStudentSchedules,
  getStudentYearlyStats,
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
      upcomingSchedules: [] as Awaited<ReturnType<typeof getStudentSchedules>>,
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

  const [schedules, totalHours, yearlyStats, monthlyStats, classDates] =
    await Promise.all([
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
    thisMonthCount: schedules.filter((s) => new Date(s.start_time) > now)
      .length,
    totalHours: Math.round(totalHours * 10) / 10,
    nextSchedule,
    upcomingSchedules,
    yearlyStats,
    monthlyStats,
    classDates,
    daysRemaining,
  };
}

const MONTH_NAMES = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

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
  const monthlyChange =
    monthlyStats.lastMonthHours > 0
      ? Math.round(
          ((monthlyStats.thisMonthHours - monthlyStats.lastMonthHours) /
            monthlyStats.lastMonthHours) *
            100,
        )
      : monthlyStats.thisMonthHours > 0
        ? 100
        : 0;

  // 차트 데이터 변환
  const chartData = yearlyStats.map((stat) => ({
    name: MONTH_NAMES[stat.month - 1],
    hours: stat.hours,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pt-0">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 수강시간</CardTitle>
            <ClockIcon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHours}시간</div>
            <p className="text-muted-foreground text-xs">누적 수업 시간</p>
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
            <div className="text-2xl font-bold">
              {monthlyStats.thisMonthHours}시간
            </div>
            <p className="text-muted-foreground text-xs">
              {monthlyChange >= 0 ? "+" : ""}
              {monthlyChange}% 전월 대비
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              이번 달 남은 수업
            </CardTitle>
            <CalendarIcon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{thisMonthCount}회</div>
            <p className="text-muted-foreground text-xs">예정된 수업</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수업 종료까지</CardTitle>
            <TargetIcon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {daysRemaining !== null ? `${daysRemaining}일` : "-"}
            </div>
            <p className="text-muted-foreground text-xs">남은 기간</p>
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
                  <defs>
                    <linearGradient
                      id="barGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                      <stop
                        offset="100%"
                        stopColor="#8b5cf6"
                        stopOpacity={0.6}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
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
                          <div className="bg-background rounded-lg border p-2 shadow-sm">
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium">
                                {payload[0].payload.name}
                              </span>
                              <span className="text-muted-foreground text-sm">
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
                    fill="url(#barGradient)"
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
                  <CalendarDaysIcon className="text-primary h-10 w-10" />
                  <div>
                    <div className="font-semibold">
                      {formatDate(nextSchedule.start_time)}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {formatTime(nextSchedule.start_time)} -{" "}
                      {formatTime(nextSchedule.end_time)}
                    </div>
                    {nextSchedule.program?.title && (
                      <div className="text-muted-foreground text-sm">
                        {nextSchedule.program.title}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CalendarIcon className="text-muted-foreground/50 h-10 w-10" />
                <p className="text-muted-foreground mt-2 text-sm">
                  예정된 수업이 없습니다
                </p>
              </div>
            )}

            {/* 학습 비교 */}
            <div className="space-y-3 border-t pt-4">
              <h4 className="text-sm font-medium">월간 비교</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">이번 달</p>
                  <p className="text-lg font-semibold">
                    {monthlyStats.thisMonthHours}시간
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {monthlyStats.thisMonthCount}회 수업
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">지난 달</p>
                  <p className="text-lg font-semibold">
                    {monthlyStats.lastMonthHours}시간
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {monthlyStats.lastMonthCount}회 수업
                  </p>
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
            <div className="space-y-4">
              {Object.entries(
                upcomingSchedules.reduce<Record<string, typeof upcomingSchedules>>(
                  (groups, schedule) => {
                    const key = schedule.program?.title || "미지정";
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(schedule);
                    return groups;
                  },
                  {},
                ),
              ).map(([programTitle, schedules]) => (
                <div key={programTitle}>
                  <h4 className="mb-2 text-sm font-semibold">{programTitle}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead>시간</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedules.map((schedule) => {
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
                              <span
                                className={
                                  date.getDay() === 0
                                    ? "text-red-500"
                                    : date.getDay() === 6
                                      ? "text-blue-500"
                                      : ""
                                }
                              >
                                {" "}({dayOfWeek})
                              </span>
                            </TableCell>
                            <TableCell>
                              {formatTime(schedule.start_time)} -{" "}
                              {formatTime(schedule.end_time)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CalendarIcon className="text-muted-foreground/50 h-12 w-12" />
              <p className="text-muted-foreground mt-4">
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
