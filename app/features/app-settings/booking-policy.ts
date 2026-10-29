import { z } from "zod";

export const BOOKING_POLICY_KEY = "booking_policy";
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const bookingPolicySchema = z
  .object({
    durationMinutes: z.array(z.number().int().min(1).max(1440)).min(1).max(24),
    defaultDurationMinutes: z.number().int().min(1).max(1440),
    firstStart: clock,
    lastStart: clock,
    startIntervalMinutes: z.number().int().min(1).max(1440),
    leadMinutes: z.number().int().min(0).max(43200),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      new Set(p.durationMinutes).size !== p.durationMinutes.length ||
      !p.durationMinutes.includes(p.defaultDurationMinutes)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "수업 길이는 중복 없이 입력하고 목록 안에서 기본값을 선택해 주세요.",
      });
    if (p.firstStart > p.lastStart)
      ctx.addIssue({
        code: "custom",
        message: "마지막 시작 시각은 첫 시작 시각 이후여야 합니다.",
      });
  });
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;
export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  durationMinutes: [180, 360, 540],
  defaultDurationMinutes: 180,
  firstStart: "09:00",
  lastStart: "20:00",
  startIntervalMinutes: 30,
  leadMinutes: 0,
};
export function parseBookingPolicy(value: unknown): BookingPolicy {
  return bookingPolicySchema.parse(value);
}
export function clockMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function minuteClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function bookingStartTimes(
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
) {
  bookingPolicySchema.parse(policy);
  const result: string[] = [];
  for (
    let m = clockMinutes(policy.firstStart);
    m <= clockMinutes(policy.lastStart);
    m += policy.startIntervalMinutes
  )
    result.push(minuteClock(m));
  return result;
}
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`;
}
export function bookingDurationOptions(
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
) {
  return policy.durationMinutes.map((minutes) => ({
    value: String(minutes),
    label: formatDuration(minutes),
    hours: minutes / 60,
  }));
}
// Legacy forms posted 1/2/3 times. New forms always send explicit minutes.
export function submittedDuration(
  form: FormData,
  policy: BookingPolicy,
  existingMinutes?: number,
) {
  const raw = form.has("duration_minutes")
    ? String(form.get("duration_minutes"))
    : String(Number(form.get("duration")) * 180);
  const minutes = Number(raw);
  if (
    !/^\d+(?:\.\d+)?$/.test(raw) ||
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    (!policy.durationMinutes.includes(minutes) && minutes !== existingMinutes)
  )
    throw new Error("허용된 수업 길이를 선택해 주세요.");
  return minutes;
}

export function calendarTimeBounds(
  policy: BookingPolicy,
  events: { start: string; end: string }[],
) {
  let first = clockMinutes(policy.firstStart),
    last = Math.min(
      1440,
      clockMinutes(policy.lastStart) + Math.max(...policy.durationMinutes),
    );
  for (const event of events) {
    const start = new Date(event.start),
      end = new Date(event.end);
    const civil = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(d);
    const date = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    if (date(start) !== date(end)) {
      first = 0;
      last = 1440;
    }
    first = Math.min(first, clockMinutes(civil(start)));
    last = Math.max(last, clockMinutes(civil(end)));
  }
  return {
    slotMinTime: minuteClock(first),
    slotMaxTime: minuteClock(last),
    slotDuration: { minutes: policy.startIntervalMinutes },
  };
}
