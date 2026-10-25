import type { StudentSchedulesData } from "./student-schedules-view";

import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

import { calendarMonthDays } from "../utils/desktop-booking";
import { toKST, toKSTDateString } from "../utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  formatLearningTime,
  scheduleTimeRange,
} from "../utils/learning-records";
import {
  bookingDateReason,
  calendarDateString,
} from "../utils/student-booking";
import { DesktopStudentBookingPanel } from "./desktop-student-booking-panel";

export function DesktopStudentSchedules({
  data,
  selectedDate,
  onSelectDate,
  onMonthChange,
  onManage,
  now,
}: {
  data: StudentSchedulesData;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onMonthChange: (date: Date) => void;
  onManage: (schedule: LearningSchedule) => void;
  now: Date;
}) {
  const [busy, setBusy] = useState(false);
  const { year, month, schedules, programs } = data;
  const date = calendarDateString(selectedDate);
  const today = toKSTDateString(now);
  const course = {
    classStartDate: data.classStartDate,
    classEndDate: data.classEndDate,
  };
  const daySchedules = schedules
    .filter((s) => toKSTDateString(new Date(s.start_time)) === date)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const reason = data.canBook
    ? bookingDateReason(date, course, now)
    : "예약 가능한 수강생 계정인지 학원에 확인해주세요.";
  const earliest = year === 1900 && month === 1;
  const latest = year === 2100 && month === 12;

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,32%)] xl:gap-6">
      <div className="min-w-0 space-y-4">
        <section
          aria-label="월간 수업 캘린더"
          className="bg-card overflow-hidden rounded-2xl border border-violet-100 dark:border-violet-900/40"
        >
          <div className="flex items-center justify-between gap-2 p-3 xl:p-5">
            <div className="flex items-center gap-1 xl:gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="이전 달"
                disabled={busy || earliest}
                onClick={() => onMonthChange(new Date(year, month - 2, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-base font-semibold whitespace-nowrap xl:text-lg">
                {year}년 {month}월
              </h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="다음 달"
                disabled={busy || latest}
                onClick={() => onMonthChange(new Date(year, month, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                const d = toKST(now);
                onSelectDate(new Date(d.year, d.month, d.day));
              }}
            >
              오늘
            </Button>
          </div>
          <div
            className="text-muted-foreground grid grid-cols-7 px-2 pb-2 text-center text-xs"
            aria-hidden="true"
          >
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {calendarMonthDays(year, month).map((day) => {
              const key = calendarDateString(day);
              const lessons = schedules
                .filter((s) => toKSTDateString(new Date(s.start_time)) === key)
                .sort((a, b) => a.start_time.localeCompare(b.start_time));
              const outside = day.getMonth() !== month - 1;
              const blocked = bookingDateReason(key, course, now);
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${formatLearningDate(`${key}T00:00:00+09:00`, true)}${lessons.length ? ` · 내 수업 ${lessons.length}건` : ""}${key < today ? " · 지난 날짜" : blocked ? " · 신규 예약 불가" : ""}`}
                  aria-pressed={date === key}
                  aria-current={key === today ? "date" : undefined}
                  disabled={
                    busy || day.getFullYear() < 1900 || day.getFullYear() > 2100
                  }
                  onClick={() => onSelectDate(day)}
                  className={`flex h-16 min-w-0 flex-col items-start gap-1 rounded-lg border border-transparent px-1.5 py-1.5 text-left text-xs hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 aria-pressed:border-violet-500 aria-pressed:bg-violet-50 xl:h-20 xl:gap-2 xl:p-2 dark:aria-pressed:border-violet-400 dark:aria-pressed:bg-violet-950/40 ${outside || blocked ? "text-muted-foreground" : ""}`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${key === today ? "bg-violet-600 font-semibold text-white dark:bg-violet-500" : ""} ${outside ? "opacity-60" : ""}`}
                  >
                    {day.getDate()}
                  </span>
                  {lessons.length > 0 && (
                    <span
                      className={`flex w-full items-center gap-1 overflow-hidden text-[10px] xl:text-xs ${outside ? "opacity-70" : ""}`}
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-violet-500" />
                      <span className="truncate tabular-nums">
                        {formatLearningTime(lessons[0].start_time)}
                        {lessons.length > 1 ? ` +${lessons.length - 1}` : ""}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 border-t p-3 text-[11px] xl:px-5">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-violet-500" />내 수업
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-violet-500 bg-violet-50 dark:bg-violet-950/40" />
              선택한 날짜
            </span>
            <span>시간별 예약 가능 여부는 예약 패널에서 확인해요</span>
          </div>
        </section>
        <div className="flex items-start gap-2.5 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-xs leading-relaxed dark:border-violet-900/40 dark:bg-violet-950/20">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-300" />
          <div>
            <p className="font-medium">
              다음 달 신규 예약은 매월 25일에 열려요.
            </p>
            {(data.classStartDate || data.classEndDate) && (
              <p className="text-muted-foreground mt-1">
                나의 수강 기간 · {data.classStartDate || "시작일 미등록"} ~{" "}
                {data.classEndDate || "종료일 미등록"}
              </p>
            )}
            <Link
              to="/learning-records"
              className="mt-2 inline-block text-violet-700 underline dark:text-violet-300"
            >
              배움 기록에서 지난 수업 돌아보기
            </Link>
          </div>
        </div>
        <section aria-label="선택한 날짜의 내 수업" className="space-y-3">
          <h3 className="text-sm font-semibold">
            {formatLearningDate(`${date}T00:00:00+09:00`)} · 내 수업{" "}
            {daySchedules.length > 0 && `${daySchedules.length}건`}
          </h3>
          {daySchedules.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-xs leading-relaxed">
              이날 등록된 수업이 없어요.
              {!reason && " 예약 패널에서 새 수업을 예약할 수 있어요."}
            </div>
          ) : (
            daySchedules.map((s) => {
              const ended = new Date(s.end_time) <= now;
              const running = !ended && new Date(s.start_time) <= now;
              return (
                <button
                  key={s.schedule_id}
                  type="button"
                  disabled={busy}
                  onClick={() => onManage(s)}
                  className="bg-card flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 p-4 text-left hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-900/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {scheduleTimeRange(s)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {s.program?.title || "내 수업"}
                    </p>
                    <span className="mt-2 block text-xs text-violet-700 dark:text-violet-300">
                      {ended ? "수업 상세 보기" : "수업 상세·예약 관리"} →
                    </span>
                  </div>
                  <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                    {ended
                      ? s.attendance_status === "PRESENT"
                        ? "출석 확인"
                        : "출결 미확인"
                      : running
                        ? "진행 중"
                        : "예약 확정"}
                  </span>
                </button>
              );
            })
          )}
        </section>
      </div>
      <DesktopStudentBookingPanel
        key={date}
        date={date}
        programs={programs}
        schedules={schedules}
        course={course}
        canBook={data.canBook}
        now={now}
        onBusyChange={setBusy}
      />
    </div>
  );
}
