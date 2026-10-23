import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";

import {
  type LearningSchedule,
  formatLearningDate,
  formatLearningTime,
} from "../utils/learning-records";
import {
  type CourseDates,
  bookingDateReason,
  bookingSlotReason,
} from "../utils/student-booking";
import {
  DURATION_OPTIONS,
  generateTimeSlots,
} from "../utils/student-schedule-rules";

export interface AvailabilityData {
  key: string;
  slots:
    | { start_time: string; available: boolean; reason: string | null }[]
    | null;
}
export function StudentBookingDialog({
  date,
  onClose,
  programs,
  schedules,
  course,
  onBooked,
}: {
  date: string | null;
  onClose: () => void;
  programs: { program_id: number; title: string }[];
  schedules: LearningSchedule[];
  course: CourseDates;
  onBooked: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const availability = useFetcher<AvailabilityData>();
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("1");
  const [program, setProgram] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const hours = DURATION_OPTIONS.find((d) => d.value === duration)!.hours;
  const busy = fetcher.state !== "idle";
  const key = `${date}:${hours}`;
  const slots = availability.data?.key === key ? availability.data.slots : null;
  const availabilityPending =
    availability.state !== "idle" || (!!date && availability.data?.key !== key);
  useEffect(() => {
    setTime("");
    setDuration("1");
    setError("");
    setProgram(programs.length === 1 ? String(programs[0].program_id) : "");
  }, [date]);
  useEffect(() => {
    if (!date) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [date]);
  const dateReason = date ? bookingDateReason(date, course, now) : null;
  useEffect(() => {
    if (date && !dateReason)
      availability.load(
        `/api/schedules/availability?date=${date}&hours=${hours}`,
      );
  }, [date, hours, dateReason]);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.success) {
      onClose();
      onBooked();
    } else
      setError(
        fetcher.data.error || "예약하지 못했어요. 날짜와 시간을 확인해주세요.",
      );
  }, [fetcher.data, fetcher.state]);
  const reasonFor = (value: string) => {
    if (!date) return "날짜를 선택해주세요.";
    const local = bookingSlotReason(date, value, hours, course, schedules, now);
    if (local) return local;
    const slot = slots?.find((s) => formatLearningTime(s.start_time) === value);
    if (slot && !slot.available)
      return (
        {
          past: "이미 지난 시작 시각이에요.",
          outside_course: "수강 기간 밖의 날짜예요.",
          student_conflict: "내 다른 수업과 겹쳐요.",
          capacity: "정원이 찼어요.",
        }[slot.reason as "past"] || "예약할 수 없는 시간이에요."
      );
    return null;
  };
  const selectedReason = time ? reasonFor(time) : null;
  const start = date && time ? new Date(`${date}T${time}:00+09:00`) : null;
  const end = start ? new Date(start.getTime() + hours * 3_600_000) : null;
  return (
    <Dialog
      open={!!date}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>수업 예약</DialogTitle>
          <DialogDescription>
            {date
              ? formatLearningDate(`${date}T00:00:00+09:00`, true)
              : "예약할 날짜를 선택해주세요."}
          </DialogDescription>
        </DialogHeader>
        {dateReason ? (
          <p role="alert" className="text-destructive text-sm">
            {dateReason}
          </p>
        ) : (
          <div className="space-y-5">
            {programs.length > 0 && (
              <div>
                <label
                  htmlFor="booking-program"
                  className="mb-2 block text-sm font-medium"
                >
                  클래스
                </label>
                <select
                  id="booking-program"
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="bg-background w-full rounded-lg border p-3 text-sm"
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
            )}
            <div>
              <label
                htmlFor="booking-duration"
                className="mb-2 block text-sm font-medium"
              >
                수업 시간
              </label>
              <select
                id="booking-duration"
                value={duration}
                onChange={(e) => {
                  setDuration(e.target.value);
                  setTime("");
                  setError("");
                }}
                className="bg-background w-full rounded-lg border p-3 text-sm"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">시작 시간</legend>
              <div className="grid grid-cols-4 gap-2">
                {generateTimeSlots(30).map((slot) => {
                  const reason = reasonFor(slot.value);
                  return (
                    <Button
                      key={slot.value}
                      type="button"
                      variant={time === slot.value ? "default" : "outline"}
                      className="h-auto min-h-10 flex-col px-1 py-2"
                      disabled={!!reason || availabilityPending}
                      aria-pressed={time === slot.value}
                      title={reason || undefined}
                      onClick={() => {
                        setTime(slot.value);
                        setError("");
                      }}
                    >
                      <span>{slot.label}</span>
                      {reason && (
                        <span className="mt-1 text-xs leading-tight">
                          {reason.includes("정원")
                            ? "정원 마감"
                            : reason.includes("겹")
                              ? "시간 겹침"
                              : "예약 불가"}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                시작 가능한 시간 · 09:00~20:00. 1타임은 3시간이에요.
                <br />
                종료 시각이 다음 날이 될 수 있으니 아래 요약을 확인해주세요.
              </p>
              <p role="status" className="text-muted-foreground mt-2 text-xs">
                {availabilityPending
                  ? "예약 가능 시간을 확인하고 있어요…"
                  : slots
                    ? "정원은 조회 시점 기준이며, 예약 시 최종 확인해요."
                    : "정원은 예약 시 최종 확인해요."}
              </p>
            </fieldset>
            <section
              className="rounded-xl bg-violet-50 p-4 text-sm dark:bg-violet-950/30"
              aria-label="예약 요약"
            >
              <p className="font-semibold">예약 내용 확인</p>
              <p className="mt-2">
                {programs.find((p) => String(p.program_id) === program)
                  ?.title ||
                  (programs.length === 0 ? "내 수업" : "클래스를 선택해주세요")}
              </p>
              {start && end ? (
                <>
                  <p className="mt-2">
                    시작 · {formatLearningDate(start, true)}{" "}
                    {formatLearningTime(start)}
                  </p>
                  <p className="mt-1">
                    종료 · {formatLearningDate(end, true)}{" "}
                    {formatLearningTime(end)}
                  </p>
                  <p className="mt-2 font-semibold">총 {hours}시간</p>
                </>
              ) : (
                <p className="text-muted-foreground mt-2">
                  시작 시간을 선택하면 종료 시각을 보여드려요.
                </p>
              )}
            </section>
          </div>
        )}
        {(error || selectedReason) && (
          <p role="alert" className="text-destructive text-sm">
            {error || selectedReason}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            닫기
          </Button>
          <Button
            disabled={
              busy ||
              !time ||
              !!dateReason ||
              !!selectedReason ||
              availabilityPending ||
              (programs.length > 0 && !program)
            }
            onClick={() => {
              if (!date || !time || busy || reasonFor(time)) return;
              setError("");
              fetcher.submit(
                {
                  date,
                  start_time: time,
                  duration,
                  ...(program ? { program_id: program } : {}),
                },
                { method: "post", action: "/api/schedules/create" },
              );
            }}
          >
            {busy ? "예약 중…" : "이 내용으로 예약"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
