import type { BookingPolicy } from "../../app-settings/booking-policy";

import { CalendarDays, List, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";

import { toKST } from "../utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  scheduleTimeRange,
} from "../utils/learning-records";
import { bookingDateReason } from "../utils/student-booking";
import { isStudentScheduleDate } from "../utils/student-week";
import { StudentBookingDialog } from "./student-booking-dialog";
import { StudentScheduleManager } from "./student-schedule-manager";
import { StudentWeeklySchedules } from "./student-weekly-schedules";

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
  selectedDate: string;
  nextSchedule: LearningSchedule | null;
  classStartDate: string | null;
  classEndDate: string | null;
  allowedStartDate: string;
  allowedEndDate: string;
  canBook: boolean;
  disabledBookingDays?: number[];
  bookingPolicy?: BookingPolicy;
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
  const requestedDate = params.get("date");
  const selectedDate =
    !list &&
    !params.has("schedule") &&
    requestedDate &&
    isStudentScheduleDate(requestedDate)
      ? requestedDate
      : data.selectedDate;
  const [selected, setSelected] = useState<LearningSchedule | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(new Date(data.now));
  const course = {
    classStartDate: data.classStartDate,
    classEndDate: data.classEndDate,
    disabledBookingDays: data.disabledBookingDays,
    bookingPolicy: data.bookingPolicy,
  };
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const requested = params.get("schedule");
    if (requested)
      setSelected(
        schedules.find(
          (schedule) => String(schedule.schedule_id) === requested,
        ) ?? null,
      );
  }, [params, schedules]);
  useEffect(() => {
    if (!list && params.get("book"))
      document
        .getElementById("student-booking-panel")
        ?.scrollIntoView({ block: "start" });
  }, [params.get("book"), list]);
  useEffect(() => {
    if (!list || !params.get("book") || !canBook) return;
    const reason = bookingDateReason(selectedDate, course, now);
    if (reason) setStatus(reason);
    else setBooking(selectedDate);
  }, [params.get("book"), list]);
  const setMonth = (date: Date) => {
    const next = new URLSearchParams(params);
    next.set("year", String(date.getFullYear()));
    next.set("month", String(date.getMonth() + 1));
    next.delete("schedule");
    next.delete("book");
    next.delete("date");
    setParams(next, { preventScrollReset: true });
  };
  const chooseDate = (date: string) => {
    const next = new URLSearchParams(params);
    next.set("date", date);
    next.delete("year");
    next.delete("month");
    next.delete("schedule");
    next.delete("book");
    setStatus("");
    setParams(next, { preventScrollReset: true });
  };
  const openBooking = () => {
    const message = canBook
      ? bookingDateReason(selectedDate, course, now)
      : "예약 가능한 수강생 계정인지 학원에 확인해주세요.";
    if (message) {
      setStatus(message);
      return;
    }
    setStatus("");
    setBooking(selectedDate);
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
            {list
              ? "등록된 수업을 월별로 확인하고 관리해요."
              : "이번 주, 배움을 이어갈 시간을 골라요."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link
              to={
                list
                  ? `/my-schedules?date=${selectedDate}`
                  : `/my-schedules/list?year=${selectedDate.slice(0, 4)}&month=${Number(selectedDate.slice(5, 7))}`
              }
            >
              {list ? (
                <CalendarDays className="size-4" />
              ) : (
                <List className="size-4" />
              )}
              {list ? "주간 예약" : "월별 목록"}
            </Link>
          </Button>
          {list && (
            <Button onClick={openBooking}>
              <Plus className="size-4" />
              수업 예약
            </Button>
          )}
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
        <StudentWeeklySchedules
          data={{ ...data, selectedDate }}
          onSelectDate={chooseDate}
          onManage={setSelected}
          now={now}
        />
      )}
      {list && (
        <div className="text-muted-foreground space-y-2 rounded-xl border border-violet-100 bg-violet-50/60 p-4 text-sm leading-relaxed dark:border-violet-900/40 dark:bg-violet-950/20">
          <p>
            신규 예약 가능 기간 · {formatLearningDate(allowedStartDate, true)} ~{" "}
            {formatLearningDate(allowedEndDate, true)}
          </p>
          <p>
            다음 달 신규 예약은 매월 25일에 열려요. 지난 수업과 미리 등록된
            수업은 월을 바꿔 확인할 수 있어요.
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
      )}
      <StudentScheduleManager
        schedule={selected}
        onClose={closeSelected}
        onCancelled={() => setStatus("수업 예약을 취소했어요.")}
      />
      <StudentBookingDialog
        date={list ? booking : null}
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
