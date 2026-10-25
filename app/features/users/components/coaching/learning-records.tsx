import { ArrowLeft, BookOpen, ChevronRight, PencilLine } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/core/components/ui/tabs";
import { LearningHeatmap } from "~/features/schedules/components/learning-heatmap";
import { LearningScheduleDetail } from "~/features/schedules/components/learning-schedule-detail";
import { toKST, toKSTDateString } from "~/features/schedules/utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  learningHeatmap,
  scheduleHours,
  scheduleTimeRange,
} from "~/features/schedules/utils/learning-records";

import { ReflectionJournal } from "./reflection-journal";

export interface LearningRecordsProps {
  schedules: LearningSchedule[];
  heatmap: ReturnType<typeof learningHeatmap>;
  totalHours: number;
  periodHours: number;
  profileId: string;
  now: string;
  year: number;
  month: number;
  all: boolean;
  firstMonth: string;
}
export function LearningRecords({
  schedules,
  heatmap,
  totalHours,
  periodHours,
  profileId,
  now,
  year,
  month,
  all,
  firstMonth,
}: LearningRecordsProps) {
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<LearningSchedule | null>(null);
  const tab = params.get("tab") === "reflections" ? "reflections" : "lessons";
  const current = toKST(new Date(now));
  const selectedMonth = `${year}-${String(month).padStart(2, "0")}`;
  const months = new Set([selectedMonth]);
  // Offer every course month, with an all-history option for records predating enrollment edits.
  const first = new Date(`${firstMonth}-01T00:00:00Z`);
  for (
    let date = new Date(Date.UTC(current.year, current.month, 1)), count = 0;
    date >= first && count < 1200;
    date.setUTCMonth(date.getUTCMonth() - 1), count++
  )
    months.add(date.toISOString().slice(0, 7));
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 text-slate-800 md:p-8 dark:text-slate-100">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="size-4" />
        학습 홈으로
      </Link>
      <header>
        <h1 className="text-2xl font-bold">배움 기록</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          언제, 얼마나 배웠는지 돌아보세요.
        </p>
      </header>
      <LearningHeatmap days={heatmap} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", value);
          setParams(next, { preventScrollReset: true });
        }}
      >
        <TabsList className="mb-6 bg-violet-100/60 dark:bg-violet-950/50">
          <TabsTrigger value="lessons">
            <BookOpen className="mr-2 size-4" />
            수업 이력
          </TabsTrigger>
          <TabsTrigger value="reflections">
            <PencilLine className="mr-2 size-4" />한 줄 회고
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lessons" className="space-y-5">
          <div>
            <p className="text-muted-foreground text-sm">
              지금까지 쌓인 수업 기록
            </p>
            <p className="mt-2 text-3xl font-bold">
              {Math.round(totalHours * 10) / 10}
              <span className="ml-1 text-lg font-medium">시간</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label
              htmlFor="record-period"
              className="text-muted-foreground text-sm"
            >
              조회 기간
            </label>
            <select
              id="record-period"
              value={all ? "all" : selectedMonth}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.value === "all") next.set("period", "all");
                else {
                  const [y, m] = event.target.value.split("-");
                  next.delete("period");
                  next.set("year", y);
                  next.set("month", String(Number(m)));
                }
                setParams(next, { preventScrollReset: true });
              }}
              className="rounded-xl border border-violet-100 bg-white px-3 py-2.5 text-sm dark:border-violet-900/40 dark:bg-[#191723]"
            >
              <option value="all">전체 기간</option>
              {[...months]
                .sort()
                .reverse()
                .map((value) => (
                  <option key={value} value={value}>
                    {value.split("-")[0]}년 {Number(value.split("-")[1])}월
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-between gap-3 rounded-xl bg-violet-100/60 p-4 text-sm text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
            <span>{all ? "전체" : `${month}월`} 수업 이력</span>
            <strong>
              {schedules.length}회 · {periodHours}시간
            </strong>
          </div>
          {schedules.length === 0 ? (
            <div className="rounded-2xl border border-violet-100 bg-white px-5 py-10 text-center dark:border-violet-900/40 dark:bg-[#191723]">
              <BookOpen className="mx-auto mb-3 size-7 text-violet-500" />
              <p className="font-medium">
                이 기간에 출석 확인된 수업이 없어요.
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                다른 기간을 살펴보거나 다음 수업을 확인해보세요.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/my-schedules">나의 일정</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3 xl:hidden">
                {schedules.map((schedule) => (
                  <button
                    key={schedule.schedule_id}
                    type="button"
                    onClick={() => setSelected(schedule)}
                    className="w-full rounded-2xl border border-violet-100 bg-white p-4 text-left transition hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-violet-900/40 dark:bg-[#191723]"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {formatLearningDate(schedule.start_time, true)}
                      </span>
                      <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                        {scheduleHours(schedule)}시간
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {scheduleTimeRange(schedule)}
                      </span>
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm break-words">
                      {schedule.program?.title || "내 수업"}
                    </p>
                  </button>
                ))}
              </div>
              <div className="hidden overflow-hidden rounded-2xl border border-violet-100 bg-white xl:block dark:border-violet-900/40 dark:bg-[#191723]">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">출석 확인된 수업 기록</caption>
                  <thead className="text-muted-foreground bg-violet-50 dark:bg-violet-950/30">
                    <tr>
                      {["날짜", "클래스", "시간", "총 시간", "상세"].map(
                        (label) => (
                          <th
                            key={label}
                            scope="col"
                            className="px-4 py-3 font-medium"
                          >
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr
                        key={s.schedule_id}
                        className="border-t border-violet-100 dark:border-violet-900/40"
                      >
                        <td className="px-4 py-4">
                          {formatLearningDate(s.start_time, true)}
                        </td>
                        <td className="px-4 py-4">
                          {s.program?.title || "내 수업"}
                        </td>
                        <td className="px-4 py-4">{scheduleTimeRange(s)}</td>
                        <td className="px-4 py-4">{scheduleHours(s)}시간</td>
                        <td className="px-4 py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`${formatLearningDate(s.start_time)} ${s.program?.title || "수업"} 상세 보기`}
                            onClick={() => setSelected(s)}
                          >
                            보기
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            출석으로 확인하고 종료된 수업만 집계해요. 미확인·결석 수업은
            제외해요.
            <br />
            예정된 수업은 ‘나의 일정’에서 확인할 수 있어요.
          </p>
        </TabsContent>
        <TabsContent value="reflections">
          <ReflectionJournal
            profileId={profileId}
            today={toKSTDateString(new Date(now))}
            history
          />
        </TabsContent>
      </Tabs>
      <LearningScheduleDetail
        schedule={selected}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
