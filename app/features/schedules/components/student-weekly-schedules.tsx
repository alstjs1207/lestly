import type { StudentSchedulesData } from "./student-schedules-view";

import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";

import { toKSTDateString } from "../utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  scheduleTimeRange,
} from "../utils/learning-records";
import { bookingDateReason } from "../utils/student-booking";
import {
  isStudentScheduleDate,
  shiftStudentDate,
  studentWeekDates,
} from "../utils/student-week";
import { StudentBookingPanel } from "./student-booking-panel";

function ScheduleCard({
  schedule,
  now,
  disabled,
  onManage,
}: {
  schedule: LearningSchedule;
  now: Date;
  disabled: boolean;
  onManage: (schedule: LearningSchedule) => void;
}) {
  const ended = new Date(schedule.end_time) <= now;
  const running = !ended && new Date(schedule.start_time) <= now;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onManage(schedule)}
      className="bg-card flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 p-4 text-left hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 dark:border-violet-900/40"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium">
          {formatLearningDate(schedule.start_time)}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums">
          {scheduleTimeRange(schedule)}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {schedule.program?.title || "내 수업"}
        </p>
      </div>
      <div className="space-y-2 text-right">
        <span className="inline-block rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
          {ended
            ? schedule.attendance_status === "PRESENT"
              ? "출석 확인"
              : "출결 미확인"
            : running
              ? "진행 중"
              : "예약 확정"}
        </span>
        <span className="block text-xs text-violet-700 dark:text-violet-300">
          {ended ? "수업 상세" : "예약 관리"} →
        </span>
      </div>
    </button>
  );
}

export function StudentWeeklySchedules({
  data,
  onSelectDate,
  onManage,
  now,
}: {
  data: StudentSchedulesData;
  onSelectDate: (date: string) => void;
  onManage: (schedule: LearningSchedule) => void;
  now: Date;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const navigation = useNavigation();
  const navigating = navigation.state !== "idle";
  const busy = submitting || navigating;
  const { schedules, programs, selectedDate: date } = data;
  const today = toKSTDateString(now);
  const dates = studentWeekDates(date);
  const currentWeek = studentWeekDates(today)[0] === dates[0];
  const nextWeek = studentWeekDates(shiftStudentDate(today, 7))[0] === dates[0];
  const course = {
    classStartDate: data.classStartDate,
    classEndDate: data.classEndDate,
  };
  const sorted = [...schedules].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  );
  const daySchedules = sorted.filter(
    (schedule) => toKSTDateString(new Date(schedule.start_time)) === date,
  );
  const upcoming = data.nextSchedule;
  const refreshKey = schedules
    .map(
      (schedule) =>
        `${schedule.schedule_id}:${schedule.start_time}:${schedule.end_time}`,
    )
    .join(",");
  const shortDate = (value: string) =>
    `${Number(value.slice(5, 7))}.${Number(value.slice(8, 10))}`;

  return (
    <div className="space-y-5">
      {upcoming && new Date(upcoming.end_time) > now && (
        <section aria-label="다가오는 내 수업" className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-medium">
            {new Date(upcoming.start_time) <= now
              ? "지금 진행 중인 수업"
              : "다가오는 내 수업"}
          </h2>
          <ScheduleCard
            schedule={upcoming}
            now={now}
            disabled={busy}
            onManage={onManage}
          />
        </section>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,36%)] xl:gap-6">
        <div className="contents lg:block lg:min-w-0 lg:space-y-5">
          <section
            aria-label="주간 수업 예약"
            aria-busy={navigating}
            className="bg-card min-w-0 rounded-2xl border border-violet-100 p-3 sm:p-5 dark:border-violet-900/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">수업 예약</h2>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-expanded={showDatePicker}
                aria-controls="student-booking-date-picker"
                onClick={() => setShowDatePicker((value) => !value)}
                className="text-violet-700 dark:text-violet-300"
              >
                다른 날짜 선택
              </Button>
            </div>
            {showDatePicker && (
              <div
                id="student-booking-date-picker"
                className="bg-muted/40 mt-3 rounded-xl p-3"
              >
                <label
                  htmlFor="student-booking-date"
                  className="mb-2 block text-xs font-medium"
                >
                  이동할 날짜
                </label>
                <input
                  id="student-booking-date"
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={date}
                  disabled={busy}
                  onChange={(event) => {
                    if (!isStudentScheduleDate(event.target.value)) return;
                    onSelectDate(event.target.value);
                    setShowDatePicker(false);
                  }}
                  className="bg-background min-h-11 w-full min-w-0 rounded-lg border p-2 text-base"
                />
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                  지난 수업과 미리 등록된 수업도 날짜를 바꿔 확인할 수 있어요.
                </p>
              </div>
            )}
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="이전 주"
                disabled={
                  busy || !isStudentScheduleDate(shiftStudentDate(date, -7))
                }
                onClick={() => onSelectDate(shiftStudentDate(date, -7))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <h3 className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums">
                <span className="text-muted-foreground block text-xs font-normal">
                  {currentWeek
                    ? "이번 주"
                    : nextWeek
                      ? "다음 주"
                      : `${dates[0].slice(0, 4)}년`}
                </span>
                {shortDate(dates[0])} — {shortDate(dates[6])}
              </h3>
              {!currentWeek && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onSelectDate(today)}
                >
                  이번 주
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="다음 주"
                disabled={
                  busy || !isStudentScheduleDate(shiftStudentDate(date, 7))
                }
                onClick={() => onSelectDate(shiftStudentDate(date, 7))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div
              className="mt-3 grid grid-cols-7 gap-1"
              aria-label="예약할 날짜 선택"
            >
              {dates.map((day, index) => {
                const lessons = sorted.filter(
                  (schedule) =>
                    toKSTDateString(new Date(schedule.start_time)) === day,
                );
                const blocked =
                  !data.canBook || !!bookingDateReason(day, course, now);
                const note = lessons.length
                  ? `${lessons.length}건`
                  : day === today
                    ? "오늘"
                    : day < today
                      ? "지난 날"
                      : blocked
                        ? "예약 불가"
                        : "";
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${formatLearningDate(`${day}T00:00:00+09:00`, true)}${lessons.length ? ` · 내 수업 ${lessons.length}건` : note ? ` · ${note}` : ""}`}
                    aria-pressed={date === day}
                    aria-current={day === today ? "date" : undefined}
                    disabled={busy || !isStudentScheduleDate(day)}
                    onClick={() => onSelectDate(day)}
                    className={`flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-transparent px-0.5 py-2 text-xs hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 aria-pressed:border-violet-600 aria-pressed:bg-violet-600 aria-pressed:text-white dark:aria-pressed:border-violet-500 dark:aria-pressed:bg-violet-500 ${blocked ? "text-muted-foreground bg-muted/30" : "bg-violet-50/50 dark:bg-violet-950/20"}`}
                  >
                    <span>
                      {["월", "화", "수", "목", "금", "토", "일"][index]}
                    </span>
                    <span className="text-base font-semibold tabular-nums">
                      {Number(day.slice(8))}
                    </span>
                    <span className="min-h-4 text-[11px] leading-tight">
                      {note || "\u00a0"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p
              role="status"
              className="text-muted-foreground mt-3 text-xs leading-relaxed"
            >
              {navigating
                ? "선택한 날짜를 불러오고 있어요…"
                : "날짜를 고른 뒤 수업 길이와 가능한 시작 시간을 선택해요."}
            </p>
          </section>
          <section
            aria-label="선택한 날짜의 내 수업"
            className="order-2 space-y-3 lg:order-none"
          >
            <h3 className="text-sm font-semibold">
              {formatLearningDate(`${date}T00:00:00+09:00`)} · 내 수업
              {daySchedules.length > 0 && ` ${daySchedules.length}건`}
            </h3>
            {daySchedules.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-xs leading-relaxed">
                이날 등록된 수업이 없어요.
              </p>
            ) : (
              daySchedules.map((schedule) => (
                <ScheduleCard
                  key={schedule.schedule_id}
                  schedule={schedule}
                  now={now}
                  disabled={busy}
                  onManage={onManage}
                />
              ))
            )}
          </section>
        </div>
        <div className="order-1 min-w-0 lg:order-none">
          <StudentBookingPanel
            key={date}
            date={date}
            programs={programs}
            schedules={schedules}
            course={course}
            canBook={data.canBook}
            now={now}
            onBusyChange={setSubmitting}
            refreshKey={refreshKey}
            disabled={navigating}
          />
        </div>
      </div>
      <details className="text-muted-foreground rounded-xl border border-violet-100 p-4 text-xs leading-relaxed dark:border-violet-900/40">
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          <CalendarClock className="size-4 shrink-0" />
          예약 가능 기간과 취소 안내
        </summary>
        <div className="mt-3 space-y-2">
          <p>
            신규 예약 가능 기간 ·{" "}
            {formatLearningDate(data.allowedStartDate, true)} ~{" "}
            {formatLearningDate(data.allowedEndDate, true)}
          </p>
          <p>
            다음 달 신규 예약은 매월 25일에 열려요. 수업 전날까지 취소할 수
            있어요.
          </p>
          {(data.classStartDate || data.classEndDate) && (
            <p>
              나의 수강 기간 · {data.classStartDate || "시작일 미등록"} ~{" "}
              {data.classEndDate || "종료일 미등록"}
            </p>
          )}
          <Link
            to="/learning-records"
            className="inline-block text-violet-700 underline dark:text-violet-300"
          >
            배움 기록에서 지난 수업 돌아보기
          </Link>
        </div>
      </details>
    </div>
  );
}
