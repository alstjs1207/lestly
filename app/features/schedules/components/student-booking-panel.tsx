import { CalendarDays, Check, Info, LockKeyhole, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";

import {
  type BookingAvailability,
  desktopBookingSlots,
} from "../utils/desktop-booking";
import { toKSTDateString } from "../utils/kst";
import {
  type LearningSchedule,
  formatLearningDate,
  formatLearningTime,
} from "../utils/learning-records";
import { type CourseDates, bookingDateReason } from "../utils/student-booking";
import { DURATION_OPTIONS } from "../utils/student-schedule-rules";

export interface BookingProgram {
  program_id: number;
  title: string;
  location_address?: string | null;
}

export function StudentBookingPanel({
  date,
  programs,
  schedules,
  course,
  canBook,
  now,
  onBusyChange,
  refreshKey,
  disabled = false,
}: {
  date: string;
  programs: BookingProgram[];
  schedules: LearningSchedule[];
  course: CourseDates;
  canBook: boolean;
  now: Date;
  onBusyChange: (busy: boolean) => void;
  refreshKey: string;
  disabled?: boolean;
}) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const availability = useFetcher<BookingAvailability>();
  const [duration, setDuration] = useState("1");
  const [time, setTime] = useState("");
  const [program, setProgram] = useState(
    programs.length === 1 ? String(programs[0].program_id) : "",
  );
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [confirmed, setConfirmed] = useState<{
    start: Date;
    end: Date;
    hours: number;
    title: string;
  } | null>(null);
  const handled = useRef(fetcher.data);
  const submitted = useRef<typeof confirmed>(null);
  const hours = DURATION_OPTIONS.find((d) => d.value === duration)!.hours;
  const submitting = fetcher.state !== "idle";
  const busy = submitting || disabled;
  const dateReason = canBook
    ? bookingDateReason(date, course, now)
    : "예약 가능한 수강생 계정인지 학원에 확인해주세요.";
  const key = `${date}:${hours}`;
  const pending =
    availability.state !== "idle" ||
    (!dateReason && availability.data?.key !== key);
  const knownCapacity =
    availability.data?.key === key && availability.data.slots !== null;
  const slots = desktopBookingSlots(
    date,
    hours,
    course,
    schedules,
    now,
    availability.data,
  );
  const selectedReason = time
    ? (slots.find((s) => s.time === time)?.reason ??
      (slots.some((s) => s.time === time)
        ? null
        : "이 시작 시간은 현재 신청할 수 없어요."))
    : null;
  const selectedProgram = programs.find(
    (p) => String(p.program_id) === program,
  );
  const start = time ? new Date(`${date}T${time}:00+09:00`) : null;
  const end = start ? new Date(start.getTime() + hours * 3_600_000) : null;
  const summary =
    confirmed ??
    (start && end
      ? { start, end, hours, title: selectedProgram?.title ?? "내 수업" }
      : null);
  const overnight =
    summary && toKSTDateString(summary.end) !== toKSTDateString(summary.start);

  useEffect(() => {
    if (!dateReason)
      availability.load(
        `/api/schedules/availability?date=${date}&hours=${hours}`,
      );
  }, [date, hours, dateReason, refresh, refreshKey]);
  useEffect(() => {
    onBusyChange(submitting);
    return () => onBusyChange(false);
  }, [submitting, onBusyChange]);
  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      handled.current === fetcher.data
    )
      return;
    handled.current = fetcher.data;
    if (fetcher.data.success) {
      setConfirmed(submitted.current);
      setError("");
    } else {
      setError(
        fetcher.data.error || "예약하지 못했어요. 날짜와 시간을 확인해주세요.",
      );
      setTime("");
      setRefresh((v) => v + 1);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <section
      id="student-booking-panel"
      aria-label="수업 예약 패널"
      aria-busy={busy}
      className="bg-card min-w-0 scroll-mt-4 overflow-hidden rounded-2xl border border-violet-100 shadow-sm dark:border-violet-900/40"
    >
      <div className="space-y-5 p-4 xl:p-5">
        <div>
          <p className="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
            <CalendarDays className="size-4" />
            선택한 날짜
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatLearningDate(`${date}T00:00:00+09:00`)}
          </h2>
          {programs.length > 1 && !confirmed ? (
            <div className="mt-4">
              <label
                htmlFor="student-booking-program"
                className="mb-2 block text-xs font-medium"
              >
                클래스
              </label>
              <select
                id="student-booking-program"
                value={program}
                disabled={busy}
                onChange={(e) => {
                  setProgram(e.target.value);
                  setError("");
                }}
                className="bg-background w-full rounded-lg border p-2 text-sm"
              >
                <option value="" disabled>
                  클래스를 선택해주세요
                </option>
                {programs.map((p) => (
                  <option key={p.program_id} value={p.program_id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-3 text-sm font-medium">
              {confirmed?.title ?? selectedProgram?.title ?? "내 수업"}
            </p>
          )}
          {selectedProgram?.location_address && (
            <p className="text-muted-foreground mt-2 flex items-start gap-1 text-xs leading-relaxed">
              <MapPin className="mt-0.5 size-3 shrink-0" />
              {selectedProgram.location_address}
            </p>
          )}
        </div>
        {confirmed ? (
          <div role="status" className="py-6 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Check className="size-6" />
            </div>
            <h3 className="text-lg font-semibold">예약이 완료됐어요.</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              다음 배움도 차근차근 이어가요.
            </p>
          </div>
        ) : dateReason ? (
          <div
            className="bg-muted/50 rounded-xl p-4 text-sm leading-relaxed"
            role="status"
          >
            <LockKeyhole className="mb-3 size-5 text-violet-600 dark:text-violet-300" />
            <p>{dateReason}</p>
            <p className="text-muted-foreground mt-2 text-xs">
              이미 등록된 수업은 선택한 날짜의 내 수업에서 확인할 수 있어요.
            </p>
          </div>
        ) : (
          <>
            <fieldset disabled={busy}>
              <legend className="mb-2 text-xs font-medium">수업 길이</legend>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    aria-pressed={duration === d.value}
                    onClick={() => {
                      setDuration(d.value);
                      setTime("");
                      setError("");
                    }}
                    className="bg-background min-h-14 rounded-lg border py-2 text-sm disabled:opacity-50 aria-pressed:border-violet-600 aria-pressed:bg-violet-50 aria-pressed:font-semibold aria-pressed:text-violet-800 dark:aria-pressed:border-violet-400 dark:aria-pressed:bg-violet-950/50 dark:aria-pressed:text-violet-200"
                  >
                    <span>{d.label.split(" ")[0]}</span>
                    <span className="mt-1 block text-xs font-normal">
                      {d.hours}시간
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={busy || pending} aria-busy={pending}>
              <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-medium">시작 시간</span>
                <span className="text-muted-foreground" role="status">
                  {pending
                    ? "가능 시간 확인 중…"
                    : knownCapacity
                      ? `${slots.filter((s) => !s.reason).length}개 선택 가능`
                      : "정원은 예약 시 확인"}
                </span>
              </legend>
              <div className="grid grid-cols-4 gap-1.5">
                {!pending &&
                  slots.map((slot) => (
                    <button
                      key={slot.time}
                      type="button"
                      disabled={!!slot.reason}
                      title={slot.reason ?? undefined}
                      aria-label={`${slot.time}${slot.label ? ` · ${slot.label}` : ""}`}
                      aria-pressed={time === slot.time}
                      onClick={() => {
                        setTime(slot.time);
                        setError("");
                      }}
                      className="bg-background disabled:bg-muted/60 disabled:text-muted-foreground flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-xs tabular-nums hover:border-violet-400 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:border-transparent aria-pressed:border-violet-600 aria-pressed:bg-violet-600 aria-pressed:text-white dark:aria-pressed:border-violet-500 dark:aria-pressed:bg-violet-500"
                    >
                      {slot.time}
                      {slot.label && (
                        <span className="mt-0.5 text-[11px] leading-tight">
                          {slot.label}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              {!pending && !slots.some((s) => !s.reason) && (
                <p
                  className="text-muted-foreground mt-3 text-xs leading-relaxed"
                  role="status"
                >
                  이 수업 시간으로 예약할 수 있는 시작 시각이 없어요. 다른
                  날짜나 수업 시간을 선택해주세요.
                </p>
              )}
              <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs leading-relaxed">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {pending
                  ? "예약 가능한 시간을 확인하고 있어요…"
                  : knownCapacity
                    ? "정원은 조회 시점 기준이며, 예약 시 최종 확인해요."
                    : "정원 정보를 가져오지 못했어요. 예약 시 최종 확인해요."}
              </p>
            </fieldset>
          </>
        )}
      </div>
      <div className="space-y-3 border-t bg-violet-50/50 p-4 xl:p-5 dark:bg-violet-950/20">
        <div aria-label="예약 요약" aria-live="polite" className="text-sm">
          <p className="text-muted-foreground mb-2 text-xs">
            {confirmed ? "예약된 수업" : "선택한 예약"}
          </p>
          {dateReason && !confirmed ? (
            <p className="text-muted-foreground text-xs">
              예약할 다른 날짜를 선택해주세요.
            </p>
          ) : (
            <>
              <p className="text-xs font-medium">
                {formatLearningDate(`${date}T00:00:00+09:00`, true)}
                {!summary && ` · ${hours}시간`}
              </p>
              {summary ? (
                <>
                  {programs.length > 1 && (
                    <p className="mt-1 text-xs">{summary.title}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-semibold tabular-nums">
                    <span className="text-xl tracking-tight">
                      {formatLearningTime(summary.start)} —{" "}
                      {overnight ? "다음 날 " : ""}
                      {formatLearningTime(summary.end)}
                    </span>
                    <span className="text-xs font-normal">
                      총 {summary.hours}시간
                    </span>
                  </p>
                  {overnight && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      종료 · {formatLearningDate(summary.end)}{" "}
                      {formatLearningTime(summary.end)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground mt-2 text-xs">
                  시작 시간을 선택해주세요.
                </p>
              )}
            </>
          )}
        </div>
        {(error || (selectedReason && time)) && !confirmed && (
          <p role="alert" className="text-destructive text-xs leading-relaxed">
            {error || selectedReason}
          </p>
        )}
        {confirmed ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setConfirmed(null);
              setTime("");
              setRefresh((v) => v + 1);
            }}
          >
            다른 날짜 살펴보기
          </Button>
        ) : (
          <Button
            className="w-full bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600"
            disabled={
              busy ||
              pending ||
              !!dateReason ||
              !time ||
              !!selectedReason ||
              (programs.length > 0 && !selectedProgram)
            }
            onClick={() => {
              if (
                !start ||
                !end ||
                busy ||
                pending ||
                dateReason ||
                selectedReason ||
                (programs.length > 0 && !selectedProgram)
              )
                return;
              submitted.current = {
                start,
                end,
                hours,
                title: selectedProgram?.title ?? "내 수업",
              };
              setError("");
              fetcher.submit(
                {
                  date,
                  start_time: time,
                  duration,
                  ...(selectedProgram ? { program_id: program } : {}),
                },
                { method: "post", action: "/api/schedules/create" },
              );
            }}
          >
            {busy ? "예약 중…" : `${hours}시간 수업 예약하기`}
          </Button>
        )}
        <p className="text-muted-foreground text-center text-xs">
          수업 전날까지 취소할 수 있어요.
        </p>
      </div>
    </section>
  );
}
