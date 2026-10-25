import { CalendarDays, List, Plus } from "lucide-react";
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { useIsMobile } from "~/core/hooks/use-mobile";

import { toKST, toKSTDateString } from "../utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  scheduleTimeRange,
} from "../utils/learning-records";
import {
  bookingDateReason,
  calendarDateString,
} from "../utils/student-booking";
import { MobileCalendar } from "./mobile-calendar";
import { StudentBookingDialog } from "./student-booking-dialog";
import { StudentScheduleManager } from "./student-schedule-manager";

const DesktopStudentSchedules = lazy(() =>
  import("./desktop-student-schedules").then((module) => ({
    default: module.DesktopStudentSchedules,
  })),
);
export interface StudentSchedulesData {
  schedules: LearningSchedule[];
  programs: {
    program_id: number;
    title: string;
    location_address?: string | null;
  }[];
  year: number;
  month: number;
  now: string;
  classStartDate: string | null;
  classEndDate: string | null;
  allowedStartDate: string;
  allowedEndDate: string;
  canBook: boolean;
}
export function StudentSchedulesView({
  data,
  list = false,
}: {
  data: StudentSchedulesData;
  list?: boolean;
}) {
  const {
    schedules,
    programs,
    year,
    month,
    allowedStartDate,
    allowedEndDate,
    canBook,
  } = data;
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();
  const initial = toKST(new Date(data.now));
  const [selectedDate, setSelectedDate] = useState(
    () =>
      new Date(
        year,
        month - 1,
        year === initial.year && month === initial.month + 1 ? initial.day : 1,
      ),
  );
  const [selected, setSelected] = useState<LearningSchedule | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(new Date(data.now));
  const course = {
    classStartDate: data.classStartDate,
    classEndDate: data.classEndDate,
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setSelectedDate((previous) =>
      previous.getFullYear() === year && previous.getMonth() === month - 1
        ? previous
        : new Date(year, month - 1, 1),
    );
  }, [year, month]);
  const requestedSchedule = params.get("schedule");
  useEffect(() => {
    if (requestedSchedule) {
      const schedule =
        schedules.find((s) => String(s.schedule_id) === requestedSchedule) ??
        null;
      setSelected(schedule);
      if (schedule) {
        const date = toKST(new Date(schedule.start_time));
        setSelectedDate(new Date(date.year, date.month, date.day));
      }
    }
  }, [requestedSchedule]);
  const requestBook = params.get("book");
  useEffect(() => {
    if (requestBook && canBook) {
      const date = toKSTDateString(new Date());
      const reason = bookingDateReason(date, course);
      if (reason) setStatus(reason);
      else setBooking(date);
    }
  }, [requestBook]);
  useEffect(() => {
    // The home shortcut opens the inline panel on PC, and the existing dialog
    // on mobile/list view. Preserve mobile selection behavior.
    if (booking && !isMobile && !list) {
      const [y, m, d] = booking.split("-").map(Number);
      setSelectedDate(new Date(y, m - 1, d));
      setBooking(null);
      const next = new URLSearchParams(params);
      next.set("year", String(y));
      next.set("month", String(m));
      next.delete("book");
      next.delete("schedule");
      setParams(next, { replace: true, preventScrollReset: true });
    }
  }, [booking, isMobile, list]);
  const setMonth = (date: Date) => {
    const next = new URLSearchParams(params);
    next.set("year", String(date.getFullYear()));
    next.set("month", String(date.getMonth() + 1));
    next.delete("schedule");
    next.delete("book");
    setParams(next, { preventScrollReset: true });
  };
  const chooseDate = (date: Date) => {
    setSelectedDate(date);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1)
      setMonth(date);
  };
  const reason = canBook
    ? bookingDateReason(calendarDateString(selectedDate), course, now)
    : "예약 가능한 수강생 계정인지 학원에 확인해주세요.";
  const openBooking = (date: Date) => {
    const message = canBook
      ? bookingDateReason(calendarDateString(date), course, new Date())
      : "예약 가능한 수강생 계정인지 학원에 확인해주세요.";
    if (message) {
      setStatus(message);
      return;
    }
    setStatus("");
    setBooking(calendarDateString(date));
  };
  const closeSelected = () => {
    setSelected(null);
    if (params.has("schedule")) {
      const next = new URLSearchParams(params);
      next.delete("schedule");
      setParams(next, { replace: true, preventScrollReset: true });
    }
  };
  const closeBooking = () => {
    setBooking(null);
    if (params.has("book")) {
      const next = new URLSearchParams(params);
      next.delete("book");
      setParams(next, { replace: true, preventScrollReset: true });
    }
  };
  const events = schedules.map((s) => ({
    id: String(s.schedule_id),
    title: s.program?.title || "내 수업",
    start: s.start_time,
    end: s.end_time,
    extendedProps: {
      scheduleId: s.schedule_id,
      programTitle: s.program?.title || null,
    },
  }));
  const visible = schedules
    .filter((s) => {
      const date = toKST(new Date(s.start_time));
      return date.year === year && date.month + 1 === month;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">나의 일정</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            <span className={list ? "" : "md:hidden"}>
              수업을 확인하고 나에게 맞는 날에 예약해요.
            </span>
            {!list && (
              <span className="hidden md:inline">
                다음 배움을 이어갈 날을 골라보세요.
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              to={
                list
                  ? `/my-schedules?year=${year}&month=${month}`
                  : `/my-schedules/list?year=${year}&month=${month}`
              }
            >
              {list ? (
                <CalendarDays className="size-4" />
              ) : (
                <List className="size-4" />
              )}
              {list ? "캘린더 보기" : "목록 보기"}
            </Link>
          </Button>
          <Button
            className={list ? undefined : "md:hidden"}
            onClick={() => openBooking(selectedDate)}
          >
            <Plus className="size-4" />
            수업 예약
          </Button>
        </div>
      </header>
      {status && (
        <p
          role="status"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-200"
        >
          {status}
        </p>
      )}
      {list ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="schedule-month"
              className="text-muted-foreground text-sm"
            >
              조회 월
            </label>
            <input
              id="schedule-month"
              type="month"
              min="1900-01"
              max="2100-12"
              value={`${year}-${String(month).padStart(2, "0")}`}
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m] = e.target.value.split("-").map(Number);
                setMonth(new Date(y, m - 1, 1));
              }}
              className="bg-background rounded-xl border p-3 text-sm"
            />
          </div>
          <section aria-label="등록된 수업 목록">
            <p className="text-muted-foreground mb-4 text-sm">
              {year}년 {month}월 · {visible.length}건
            </p>
            {visible.length === 0 ? (
              <div className="bg-card rounded-2xl border p-10 text-center">
                <CalendarDays className="mx-auto mb-4 size-8 text-violet-500" />
                <p>이 달에는 등록된 수업이 없어요.</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  다른 달의 일정도 확인할 수 있어요.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {visible.map((s) => {
                  const ended = new Date(s.end_time) <= now;
                  const running = !ended && new Date(s.start_time) <= now;
                  return (
                    <button
                      key={s.schedule_id}
                      type="button"
                      onClick={() => setSelected(s)}
                      className="rounded-2xl border border-violet-100 bg-white p-5 text-left hover:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-violet-900/40 dark:bg-[#191723]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {formatLearningDate(s.start_time, true)}
                        </p>
                        <span className="shrink-0 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
                          {ended
                            ? s.attendance_status === "PRESENT"
                              ? "출석 확인"
                              : "출결 미확인"
                            : running
                              ? "진행 중"
                              : "예약 확정"}
                        </span>
                      </div>
                      <p className="mt-3 font-semibold">
                        {scheduleTimeRange(s)}
                      </p>
                      <p className="text-muted-foreground mt-2 text-sm">
                        {s.program?.title || "내 수업"}
                      </p>
                      <span className="mt-4 block text-sm font-medium text-violet-700 dark:text-violet-300">
                        {ended ? "수업 상세 보기" : "수업 상세·예약 관리"} →
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="md:hidden">
            <MobileCalendar
              events={events}
              selectedDate={selectedDate}
              displayedMonth={new Date(year, month - 1, 1)}
              onMonthChange={setMonth}
              onDateSelect={chooseDate}
              onEventClick={(event) =>
                setSelected(
                  schedules.find((s) => s.schedule_id === event.scheduleId) ||
                    null,
                )
              }
              onAddClick={openBooking}
              allowedStartDate={allowedStartDate}
              allowedEndDate={allowedEndDate}
              bookingDisabledReason={reason}
            />
          </div>
          <div className="hidden md:block">
            {!isMobile && (
              <Suspense
                fallback={
                  <div
                    role="status"
                    className="bg-card min-h-96 animate-pulse rounded-2xl border p-6 text-sm"
                  >
                    캘린더를 불러오고 있어요…
                  </div>
                }
              >
                <DesktopStudentSchedules
                  data={data}
                  selectedDate={selectedDate}
                  onSelectDate={chooseDate}
                  onMonthChange={setMonth}
                  onManage={setSelected}
                  now={now}
                />
              </Suspense>
            )}
          </div>
        </>
      )}
      <div
        className={`${list ? "" : "md:hidden"} text-muted-foreground space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-sm leading-relaxed dark:border-violet-900/40 dark:bg-violet-950/20`}
      >
        <p>
          신규 예약 가능 기간 · {formatLearningDate(allowedStartDate, true)} ~{" "}
          {formatLearningDate(allowedEndDate, true)}
        </p>
        <p>
          다음 달 신규 예약은 매월 25일에 열려요. 지난 수업과 미리 등록된 수업은
          월을 바꿔 확인할 수 있어요.
        </p>
        {(data.classStartDate || data.classEndDate) && (
          <p>
            나의 수강 기간 · {data.classStartDate || "시작일 미등록"} ~{" "}
            {data.classEndDate || "종료일 미등록"}
          </p>
        )}
        <Link
          to="/learning-records"
          className="inline-block font-medium text-violet-700 underline dark:text-violet-300"
        >
          배움 기록에서 지난 수업 돌아보기
        </Link>
      </div>
      <StudentScheduleManager
        schedule={selected}
        onClose={closeSelected}
        onCancelled={() => setStatus("수업 예약을 취소했어요.")}
      />
      <StudentBookingDialog
        date={isMobile || list ? booking : null}
        onClose={closeBooking}
        programs={programs}
        schedules={schedules}
        course={course}
        onBooked={() =>
          setStatus("수업 예약을 등록했어요. 일정에서 확인할 수 있어요.")
        }
      />
    </main>
  );
}
