import { z } from "zod";

import { fromKST, toKST } from "../schedules/utils/kst.ts";

export const CANCELLATION_POLICY_KEY = "cancellation_policy";
export const cancellationPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("previous_day") }).strict(),
  z
    .object({
      mode: z.literal("hours_before"),
      hours: z.number().int().min(0).max(720),
    })
    .strict(),
]);
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  mode: "previous_day",
};

export function cancellationDeadline(
  start: Date,
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
) {
  cancellationPolicySchema.parse(policy);
  if (policy.mode === "hours_before")
    return new Date(+start - policy.hours * 3_600_000);
  const kst = toKST(start);
  return fromKST(kst.year, kst.month, kst.day);
}

export function canCancelWithPolicy(
  start: Date,
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
  now = new Date(),
) {
  const deadline = cancellationDeadline(start, policy);
  return (
    +now < +start &&
    (policy.mode === "previous_day" ? +now < +deadline : +now <= +deadline)
  );
}

export function cancellationPolicyDescription(
  policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY,
) {
  return policy.mode === "previous_day"
    ? "수업 전날 23:59까지 취소할 수 있어요."
    : policy.hours === 0
      ? "수업 시작 전까지 취소할 수 있어요."
      : `수업 시작 ${policy.hours}시간 전까지 취소할 수 있어요.`;
}

export function cancellationPolicyFromForm(form: FormData): CancellationPolicy {
  const mode = form.get("cancellationMode");
  const raw = form.get("cancellationHours");
  return cancellationPolicySchema.parse(
    mode === "previous_day"
      ? { mode }
      : {
          mode,
          hours:
            typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN,
        },
  );
}

export function sameCancellationPolicy(
  a: CancellationPolicy,
  b: CancellationPolicy,
) {
  return (
    a.mode === b.mode &&
    (a.mode === "previous_day" ||
      (b.mode === "hours_before" && a.hours === b.hours))
  );
}
