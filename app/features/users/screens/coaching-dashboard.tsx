import type { Route } from "./+types/coaching-dashboard";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  calculateStudentTotalHours,
  getStudentClassDates,
  getStudentMonthlyStats,
  getStudentProgramHoursBreakdown,
  getStudentSchedules,
  getStudentStreak,
  getStudentYearlyStats,
} from "~/features/schedules/queries";
import { AchievementStrip } from "~/features/users/components/coaching/achievement-strip";
import { AIInsightBanner } from "~/features/users/components/coaching/ai-insight-banner";
import { AnnualLearningChart } from "~/features/users/components/coaching/annual-learning-chart";
import { ConditionScheduleCard } from "~/features/users/components/coaching/condition-schedule-card";
import { GoalProgressCard } from "~/features/users/components/coaching/goal-progress-card";
import { HeaderSection } from "~/features/users/components/coaching/header-section";
import { MotivationCard } from "~/features/users/components/coaching/motivation-card";
import { TodayTodoCard } from "~/features/users/components/coaching/today-todo-card";

export const meta: Route.MetaFunction = () => {
  return [{ title: `AI 코칭 대시보드 | ${import.meta.env.VITE_APP_NAME}` }];
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return {
      totalHours: 0,
      streak: 0,
      nextSchedule: null,
      upcomingSchedules: [],
      yearlyStats: [],
      monthlyStats: {
        thisMonthHours: 0,
        lastMonthHours: 0,
        thisMonthCount: 0,
        lastMonthCount: 0,
      },
      programBreakdown: [],
      daysRemaining: null,
      thisMonthTotalHours: 0,
      remainingClasses: 0,
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
    streak,
    programBreakdown,
  ] = await Promise.all([
    getStudentSchedules(client, { studentId: user.id, year, month }),
    calculateStudentTotalHours(client, { studentId: user.id }),
    getStudentYearlyStats(client, { studentId: user.id, year }),
    getStudentMonthlyStats(client, { studentId: user.id }),
    getStudentClassDates(client, { studentId: user.id }),
    getStudentStreak(client, { studentId: user.id }),
    getStudentProgramHoursBreakdown(client, { studentId: user.id, year }),
  ]);

  // 이번 달 전체 수업 시간 계산 (goalHours)
  const thisMonthTotalHours = schedules.reduce((total, s) => {
    const start = new Date(s.start_time);
    const end = new Date(s.end_time);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return total + hours;
  }, 0);

  // 남은 수업 (아직 시작 안 한 수업)
  const remainingSchedules = schedules.filter((s) => new Date(s.start_time) > now);
  const upcomingSchedules = remainingSchedules.slice(0, 5);

  const nextSchedule = upcomingSchedules[0] || null;

  let daysRemaining: number | null = null;
  if (classDates.classEndDate) {
    const endDate = new Date(classDates.classEndDate);
    const diffTime = endDate.getTime() - now.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) daysRemaining = 0;
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    streak,
    nextSchedule,
    upcomingSchedules,
    yearlyStats,
    monthlyStats,
    programBreakdown,
    daysRemaining,
    thisMonthTotalHours: Math.round(thisMonthTotalHours * 10) / 10,
    remainingClasses: remainingSchedules.length,
  };
}

export default function CoachingDashboard({ loaderData }: Route.ComponentProps) {
  const {
    totalHours,
    streak,
    nextSchedule,
    upcomingSchedules,
    yearlyStats,
    monthlyStats,
    programBreakdown,
    daysRemaining,
    thisMonthTotalHours,
    remainingClasses,
  } = loaderData;

  return (
    <div className="flex flex-1 flex-col gap-3 bg-gray-50 p-4 text-gray-900 dark:bg-[#0d0d14] dark:text-gray-100 md:gap-4 md:p-6">
      {/* 헤더 */}
      <HeaderSection daysRemaining={daysRemaining} />

      {/* Achievement Strip - 데스크탑에서만 표시 */}
      <div className="hidden md:block">
        <AchievementStrip
          streak={streak}
          totalHours={totalHours}
          completedTodos={0}
          totalTodos={3}
        />
      </div>

      {/* AI 인사이트 배너 */}
      <AIInsightBanner
        thisMonthHours={monthlyStats.thisMonthHours}
        lastMonthHours={monthlyStats.lastMonthHours}
        thisMonthCount={monthlyStats.thisMonthCount}
        goalHours={thisMonthTotalHours}
        totalHours={totalHours}
      />

      {/* 목표대비 학습 현황 - AI 인사이트 바로 아래 */}
      <GoalProgressCard
        thisMonthHours={monthlyStats.thisMonthHours}
        goalHours={thisMonthTotalHours}
        remainingClasses={remainingClasses}
      />

      {/* 메인 그리드 - 2열 레이아웃 */}
      <div className="grid gap-3 md:gap-5 lg:grid-cols-2">
        {/* 왼쪽 컬럼 */}
        <div className="flex flex-col gap-3 md:gap-5">
          <TodayTodoCard nextSchedule={nextSchedule} />
          <ConditionScheduleCard upcomingSchedules={upcomingSchedules} />
        </div>

        {/* 오른쪽 컬럼 */}
        <div className="flex flex-col gap-3 md:gap-5">
          <AnnualLearningChart
            yearlyStats={yearlyStats}
            programBreakdown={programBreakdown}
          />
          <MotivationCard streak={streak} totalHours={totalHours} />
        </div>
      </div>
    </div>
  );
}
