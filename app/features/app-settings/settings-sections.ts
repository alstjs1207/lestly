import { z } from "zod";

import { disabledBookingDaysFromForm } from "./booking-days.ts";
import {
  DEFAULT_BOOKING_POLICY,
  bookingPolicySchema,
} from "./booking-policy.ts";
import { disabledBookingTimesFromForm } from "./booking-times.ts";
import { bookingWindowFromForm } from "./booking-window.ts";
import { cancellationPolicyFromForm } from "./cancellation-policy.ts";

export const SETTINGS_SECTIONS = [
  "class_defaults",
  "booking_times",
  "booking_window",
  "booking_days",
  "cancellation_policy",
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

/** Parse only the submitted section. Other drafts are never sent or validated. */
export function settingsSectionFromForm(form: FormData) {
  const section = z.enum(SETTINGS_SECTIONS).parse(form.get("section"));
  const number = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  };
  switch (section) {
    case "class_defaults": {
      const policy = bookingPolicySchema.parse({
        ...DEFAULT_BOOKING_POLICY,
        durationMinutes: String(form.get("durationMinutes") ?? "")
          .trim()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(Number),
        defaultDurationMinutes: number("defaultDurationMinutes"),
      });
      return {
        section,
        values: {
          durationMinutes: policy.durationMinutes,
          defaultDurationMinutes: policy.defaultDurationMinutes,
          maxCapacity: z
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(number("max_concurrent_students")),
        },
      };
    }
    case "booking_times": {
      const policy = bookingPolicySchema.parse({
        ...DEFAULT_BOOKING_POLICY,
        firstStart: form.get("firstStart"),
        lastStart: form.get("lastStart"),
        startIntervalMinutes: number("startIntervalMinutes"),
        leadMinutes: number("leadMinutes"),
      });
      return {
        section,
        values: {
          firstStart: policy.firstStart,
          lastStart: policy.lastStart,
          startIntervalMinutes: policy.startIntervalMinutes,
          leadMinutes: policy.leadMinutes,
          disabledStartTimes: disabledBookingTimesFromForm(form),
        },
      };
    }
    case "booking_window":
      return { section, values: bookingWindowFromForm(form) };
    case "booking_days":
      return {
        section,
        values: { disabledWeekdays: disabledBookingDaysFromForm(form) },
      };
    case "cancellation_policy":
      return { section, values: cancellationPolicyFromForm(form) };
  }
}
