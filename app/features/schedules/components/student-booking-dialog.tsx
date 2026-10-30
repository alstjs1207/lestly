import type { BookingProgram } from "./student-booking-panel";

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
  DEFAULT_BOOKING_POLICY,
  bookingDurationOptions,
  formatDuration,
} from "../../app-settings/booking-policy";
import {
  canCancelWithPolicy,
  cancellationPolicyDescription,
} from "../../app-settings/cancellation-policy";
import { resolveProgramBookingPolicy } from "../../programs/booking-policy";
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

export type AvailabilityData = BookingAvailability;
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
  programs: BookingProgram[];
  schedules: LearningSchedule[];
  course: CourseDates;
  onBooked: () => void;
}) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const availability = useFetcher<AvailabilityData>();
  const [time, setTime] = useState("");
  const [program, setProgram] = useState(
    programs[0] ? String(programs[0].program_id) : "",
  );
  const selectedClass = programs.find((p) => String(p.program_id) === program);
  const organizationPolicy = course.bookingPolicy ?? DEFAULT_BOOKING_POLICY;
  const classPolicy = selectedClass
    ? resolveProgramBookingPolicy(organizationPolicy, selectedClass)
    : organizationPolicy;
  const policy =
    availability.data?.key.startsWith(`${program}:${date}:`) &&
    availability.data.bookingPolicy
      ? availability.data.bookingPolicy
      : classPolicy;
  const DURATION_OPTIONS = bookingDurationOptions(policy);
  const [duration, setDuration] = useState(
    String(policy.defaultDurationMinutes),
  );

  const [error, setError] = useState("");
  const [acceptNoCancellation, setAcceptNoCancellation] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const hours = (
    DURATION_OPTIONS.find((d) => d.value === duration) ??
    DURATION_OPTIONS.find(
      (d) => d.value === String(policy.defaultDurationMinutes),
    )!
  ).hours;
  useEffect(() => {
    if (!policy.durationMinutes.includes(Number(duration))) {
      setDuration(String(policy.defaultDurationMinutes));
      setTime("");
    }
  }, [JSON.stringify(policy)]);
  const busy = fetcher.state !== "idle";
  const key = `${program}:${date}:${hours}`;
  useEffect(() => {
    setDuration(String(classPolicy.defaultDurationMinutes));
    setTime("");
    setAcceptNoCancellation(false);
    setError("");
  }, [program]);
  const today = toKSTDateString(now);
  const slots = availability.data?.key === key ? availability.data.slots : null;
  const availabilityPending =
    availability.state !== "idle" || (!!date && availability.data?.key !== key);
  useEffect(() => {
    setTime("");
    setDuration(String(policy.defaultDurationMinutes));
    setError("");
    setProgram(programs[0] ? String(programs[0].program_id) : "");
  }, [date]);
  useEffect(() => {
    if (!date) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [date]);
  const requestDateReason = date
    ? bookingDateReason(date, { ...course, bookingPolicy: policy }, now)
    : null;
  const dateReason = date
    ? requestDateReason ||
      bookingDateReason(
        date,
        availability.data?.key === key && availability.data.disabledDays
          ? {
              ...course,
              bookingPolicy: policy,
              disabledBookingDays: availability.data.disabledDays,
            }
          : { ...course, bookingPolicy: policy },
        now,
      )
    : null;
  useEffect(() => {
    if (date && selectedClass)
      availability.load(
        `/api/schedules/availability?program_id=${program}&date=${date}&minutes=${Math.round(hours * 60)}`,
      );
  }, [program, date, hours, today, refresh]);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.success) {
      onClose();
      onBooked();
    } else {
      setTime("");
      setRefresh((value) => value + 1);
      setError(
        fetcher.data.error || "예약하지 못했어요. 날짜와 시간을 확인해주세요.",
      );
    }
  }, [fetcher.data, fetcher.state]);
  const visibleSlots = date
    ? desktopBookingSlots(
        date,
        hours,
        { ...course, programId: Number(program), bookingPolicy: policy },
        schedules,
        now,
        availability.data,
      )
    : [];
  const reasonFor = (value: string) =>
    visibleSlots.find((slot) => slot.time === value)?.reason ??
    (visibleSlots.some((slot) => slot.time === value)
      ? null
      : "이 시작 시간은 현재 신청할 수 없어요.");
  const selectedReason = time ? reasonFor(time) : null;
  const start = date && time ? new Date(`${date}T${time}:00+09:00`) : null;
  const noCancellation =
    !!start && !canCancelWithPolicy(start, policy.cancellationPolicy, now);
  const acceptanceKey = `${program}:${date}:${time}:${JSON.stringify(policy.cancellationPolicy)}`;
  useEffect(() => setAcceptNoCancellation(false), [acceptanceKey]);
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
                {!availabilityPending &&
                  visibleSlots.map((slot) => {
                    const reason = reasonFor(slot.time);
                    return (
                      <Button
                        key={slot.time}
                        type="button"
                        variant={time === slot.time ? "default" : "outline"}
                        className="h-auto min-h-10 flex-col px-1 py-2"
                        disabled={!!reason || availabilityPending}
                        aria-pressed={time === slot.time}
                        title={reason || undefined}
                        onClick={() => {
                          setTime(slot.time);
                          setError("");
                        }}
                      >
                        <span>{slot.time}</span>
                        {reason && (
                          <span className="mt-1 text-xs leading-tight">
                            {reason.includes("정원")
                              ? "정원 마감"
                              : reason.includes("마감")
                                ? "접수 마감"
                                : reason.includes("겹")
                                  ? "시간 겹침"
                                  : "예약 불가"}
                          </span>
                        )}
                      </Button>
                    );
                  })}
              </div>
              {!availabilityPending && visibleSlots.length === 0 && (
                <p role="status" className="text-muted-foreground mt-3 text-sm">
                  신청 가능한 시작 시간이 없어요. 수업 운영자에게 문의해주세요.
                </p>
              )}
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                예약 가능한 시작 시간만 표시돼요. 선택한 수업 길이에 맞춰 종료
                시각을 계산해요.
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
                  <p className="mt-2 font-semibold">
                    총 {formatDuration(Math.round(hours * 60))}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground mt-2">
                  시작 시간을 선택하면 종료 시각을 보여드려요.
                </p>
              )}
            </section>
          </div>
        )}
        {availability.data?.key === key &&
          availability.data.slots === null &&
          !requestDateReason && (
            <Button
              type="button"
              variant="outline"
              disabled={availability.state !== "idle"}
              onClick={() =>
                availability.load(
                  `/api/schedules/availability?program_id=${program}&date=${date}&minutes=${Math.round(hours * 60)}`,
                )
              }
            >
              가능 시간 다시 불러오기
            </Button>
          )}
        {(error || selectedReason) && (
          <p role="alert" className="text-destructive text-sm">
            {error || selectedReason}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          {cancellationPolicyDescription(policy.cancellationPolicy)}
        </p>
        {noCancellation && (
          <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <input
              type="checkbox"
              checked={acceptNoCancellation}
              disabled={busy}
              onChange={(e) => setAcceptNoCancellation(e.target.checked)}
              className="mt-1 shrink-0"
            />
            <span>
              이 수업은 이미 취소 기한이 지났어요. 예약 후 직접 취소할 수
              없으며, 변경은 수업 운영자에게 문의해야 함을 확인했어요.
            </span>
          </label>
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
              (noCancellation && !acceptNoCancellation) ||
              availabilityPending ||
              !selectedClass
            }
            onClick={() => {
              if (
                !date ||
                !time ||
                busy ||
                reasonFor(time) ||
                availabilityPending ||
                dateReason ||
                (noCancellation && !acceptNoCancellation) ||
                !selectedClass
              )
                return;
              setError("");
              fetcher.submit(
                {
                  date,
                  start_time: time,
                  duration_minutes: String(Math.round(hours * 60)),
                  cancellation_policy: JSON.stringify(
                    policy.cancellationPolicy,
                  ),
                  accept_no_cancellation: acceptNoCancellation ? "1" : "0",
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
