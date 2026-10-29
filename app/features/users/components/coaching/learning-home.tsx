import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Clover,
  MapPin,
  Plus,
  Sprout,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { toKST, toKSTDateString } from "~/features/schedules/utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  learningLocation,
  scheduleTimeRange,
} from "~/features/schedules/utils/learning-records";

import { CoursePeriodCard } from "./course-period-card";
import { ReflectionJournal } from "./reflection-journal";

export interface LearningHomeProps {
  graduated?: boolean;
  profileId: string;
  name: string;
  now: string;
  classStartDate: string | null;
  classEndDate: string | null;
  totalHours: number;
  thisMonthHours: number;
  thisMonthCount: number;
  upcomingCount: number;
  nextSchedule: LearningSchedule | null;
  chart: { month: number; hours: number }[];
}

export function LearningHome(props: LearningHomeProps) {
  const {
    profileId,
    name,
    totalHours,
    thisMonthHours,
    thisMonthCount,
    upcomingCount,
    nextSchedule,
    chart,
  } = props;
  const now = new Date(props.now);
  const nextLocation = learningLocation(nextSchedule?.program ?? null);
  const expired =
    !!props.classEndDate && props.classEndDate < toKSTDateString(now);
  const maximum = Math.max(1, ...chart.map((d) => d.hours));
  const card =
    "rounded-2xl border border-violet-100 bg-white p-5 md:p-6 dark:border-violet-900/40 dark:bg-[#191723]";
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 text-slate-800 md:space-y-6 md:p-8 dark:text-slate-100">
      <aside
        className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        aria-label="오늘의 응원"
      >
        <Clover className="size-5 shrink-0" />
        <div>
          <span className="text-xs font-semibold">오늘의 응원</span>
          <p className="mt-0.5 text-sm leading-relaxed break-keep">
            {totalHours > 0
              ? "작은 진전도 진전이에요. 오늘도 나의 속도로 이어가요."
              : "처음부터 잘할 필요 없어요. 나의 속도로 시작해요."}
          </p>
        </div>
      </aside>
      <header>
        <p className="text-muted-foreground text-sm">
          {formatLearningDate(now)}
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-tight md:text-2xl">
          {name || "수강생"}님,{" "}
          {totalHours > 0
            ? "차곡차곡 쌓여가고 있어요."
            : "배움의 첫걸음을 함께해요."}
        </h1>
      </header>
      {props.graduated && (
        <p className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-100">
          이 운영 공간의 수강이 종료된 상태입니다. 지난 수업 기록을 확인할 수
          있으며 새 수업은 예약할 수 없습니다.
        </p>
      )}
      {!props.graduated && (
        <CoursePeriodCard
          startDate={props.classStartDate}
          endDate={props.classEndDate}
          now={now}
        />
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <section className={card} aria-label="쌓여가는 배움">
          <div className="mb-5 flex items-center justify-between gap-2">
            <h2 className="font-semibold">쌓여가는 배움</h2>
            <Link
              to="/learning-records"
              className="flex items-center text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
            >
              기록 보기
              <ChevronRight className="size-4" />
            </Link>
          </div>
          {totalHours > 0 ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-muted-foreground text-sm">
                    지금까지 쌓인 수업 기록
                  </p>
                  <p className="mt-2 text-4xl font-bold tracking-tight">
                    {Math.round(totalHours * 10) / 10}
                    <span className="ml-1 text-lg font-medium">시간</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-sm">이번 달</p>
                  <p className="mt-1 font-semibold text-violet-700 dark:text-violet-300">
                    {thisMonthHours}시간
                  </p>
                </div>
              </div>
              <figure
                className="mt-6 flex items-end gap-4 border-b border-violet-100 px-3 pb-2 dark:border-violet-900/40"
                aria-label="최근 3개월 출석 확인된 수업 시간"
              >
                {chart.map((d) => (
                  <div
                    key={d.month}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <span className="text-muted-foreground text-sm">
                      {d.hours}시간
                    </span>
                    <div
                      className="w-full max-w-20 rounded-t-md bg-violet-300 dark:bg-violet-600"
                      style={{
                        height:
                          d.hours > 0
                            ? Math.max(4, (d.hours / maximum) * 88)
                            : 2,
                      }}
                    />
                    <span className="text-muted-foreground text-sm">
                      {d.month}월
                    </span>
                  </div>
                ))}
              </figure>
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-violet-50 p-4 dark:bg-violet-950/30">
                <div>
                  <p className="text-muted-foreground text-sm">
                    이번 달 참여한 수업
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {thisMonthCount}회
                  </p>
                </div>
                <div className="border-l border-violet-100 pl-4 dark:border-violet-900/50">
                  <p className="text-muted-foreground text-sm">
                    이번 달 예정 수업
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {upcomingCount}회
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <Sprout className="mx-auto mb-4 size-9 text-violet-600 dark:text-violet-300" />
              <h3 className="font-semibold">
                첫 배움이 쌓일 자리를 준비했어요.
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                수업을 시작하면 시간과 기록을
                <br />
                여기에서 함께 돌아볼 수 있어요.
              </p>
            </div>
          )}
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            출석 확인된 종료 수업 기준 · 미확인·결석 제외
          </p>
        </section>
        <div className="space-y-5 lg:space-y-6">
          <section className={card} aria-label="다음 수업">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">
                {nextSchedule && new Date(nextSchedule.start_time) <= now
                  ? "지금 진행 중인 수업"
                  : "다음 수업"}
              </h2>
              <CalendarDays className="size-5 text-violet-600 dark:text-violet-300" />
            </div>
            {nextSchedule ? (
              <>
                <p className="text-base font-semibold text-violet-700 dark:text-violet-300">
                  {formatLearningDate(nextSchedule.start_time, true)}
                </p>
                <p className="mt-2 flex items-center gap-2 text-base font-semibold">
                  <Clock3 className="text-muted-foreground size-4 shrink-0" />
                  {scheduleTimeRange(nextSchedule)}
                </p>
                <h3 className="mt-4 font-semibold">
                  {nextSchedule.program?.title || "내 수업"}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  담당 강사 ·{" "}
                  {nextSchedule.program?.instructor?.name ||
                    "수업 운영자에게 확인해주세요"}
                </p>
                <p className="text-muted-foreground mt-2 flex items-start gap-2 text-sm leading-relaxed">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  {nextLocation.label}
                </p>
              </>
            ) : (
              <div className="py-4">
                <h3 className="font-semibold">예정된 수업이 없어요.</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  {expired
                    ? "수강 기간이 끝났어요. 다음 수강은 수업 운영자에게 문의해주세요."
                    : "나에게 맞는 날에 다음 배움을 이어가요."}
                </p>
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link
                  to={
                    nextSchedule
                      ? (() => {
                          const d = toKST(new Date(nextSchedule.start_time));
                          return `/my-schedules?year=${d.year}&month=${d.month + 1}&schedule=${nextSchedule.schedule_id}`;
                        })()
                      : "/my-schedules"
                  }
                >
                  일정 확인
                </Link>
              </Button>
              {!expired && !props.graduated && (
                <Button
                  asChild
                  className="flex-1 bg-violet-700 text-white hover:bg-violet-800 dark:bg-violet-500 dark:hover:bg-violet-600"
                >
                  <Link to="/my-schedules?book=1">
                    <Plus className="size-4" />
                    수업 예약
                  </Link>
                </Button>
              )}
            </div>
            <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
              예약 가능 기간과 취소 기한은 일정 화면에서 확인해주세요. 이미
              예약한 수업은 수업 상세에 표시된 취소 규칙을 따라요.
            </p>
          </section>
          <ReflectionJournal
            profileId={profileId}
            today={toKSTDateString(now)}
          />
        </div>
      </div>
    </main>
  );
}
