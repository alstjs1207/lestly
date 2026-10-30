import { z } from "zod";

import { type BookingPolicy } from "../app-settings/booking-policy.ts";

export const programBookingSchema = z
  .object({
    duration_minutes: z.number().int().min(1).max(1440),
    booking_duration_minutes: z
      .array(z.number().int().min(1).max(1440))
      .min(1)
      .max(48),
    max_capacity: z.number().int().min(1).max(100),
  })
  .superRefine((p, ctx) => {
    if (
      new Set(p.booking_duration_minutes).size !==
        p.booking_duration_minutes.length ||
      !p.booking_duration_minutes.includes(p.duration_minutes)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "허용할 수업 길이는 중복 없이 입력하고 기본 수업 시간을 포함해 주세요.",
      });
  });
export interface ProgramBookingFields {
  duration_minutes: number;
  booking_duration_minutes: number[];
  max_capacity: number;
}
export function resolveProgramBookingPolicy(
  organizationPolicy: BookingPolicy,
  program: ProgramBookingFields,
): BookingPolicy {
  const fields = programBookingSchema.parse(program);
  return {
    ...organizationPolicy,
    durationMinutes: fields.booking_duration_minutes,
    defaultDurationMinutes: fields.duration_minutes,
  };
}
export function programBookingDefaults(
  policy: BookingPolicy,
  capacity: number,
) {
  return programBookingSchema.parse({
    duration_minutes: policy.defaultDurationMinutes,
    booking_duration_minutes: [...policy.durationMinutes],
    max_capacity: capacity,
  });
}
