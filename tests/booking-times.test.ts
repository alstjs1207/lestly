import assert from "node:assert/strict";
import test from "node:test";

import {
  DISABLED_BOOKING_DAYS_KEY,
  disabledBookingDaysFromForm,
} from "../app/features/app-settings/booking-days.ts";
import * as bookingPolicy from "../app/features/app-settings/booking-policy.ts";
import {
  BOOKING_START_TIMES,
  disabledBookingTimesFromForm,
  parseDisabledBookingTimes,
} from "../app/features/app-settings/booking-times.ts";
import * as bookingWindow from "../app/features/app-settings/booking-window.ts";
import * as cancellation from "../app/features/app-settings/cancellation-policy.ts";
import { desktopBookingSlots } from "../app/features/schedules/utils/desktop-booking.ts";
import { toKSTDateString as realKstDate } from "../app/features/schedules/utils/kst.ts";
import { parseDateString } from "../app/features/schedules/utils/student-schedule-rules.ts";
// Exercise the real route handlers with explicit dependencies and no live writes.
import { loadMockedModule } from "./helpers/mocked-module.ts";

const course = { classStartDate: null, classEndDate: null };
const now = new Date("2026-10-23T00:00:00Z");
function form(allowed: string[]) {
  const data = new FormData();
  data.set("booking_times_present", "1");
  allowed.forEach((time) => data.append("allowed_start_times", time));
  return data;
}
test("admin time form supports all, none, partial and rejects malformed times", () => {
  assert.equal(BOOKING_START_TIMES.length, 23);
  assert.deepEqual(disabledBookingTimesFromForm(form(BOOKING_START_TIMES)), []);
  assert.deepEqual(disabledBookingTimesFromForm(form([])), BOOKING_START_TIMES);
  assert.deepEqual(
    disabledBookingTimesFromForm(
      form(BOOKING_START_TIMES.filter((time) => time !== "12:30")),
    ),
    ["12:30"],
  );
  for (const time of ["08:30", "20:30", "12:15", "9:00", "oops"]) {
    assert.throws(() => disabledBookingTimesFromForm(form([time])));
  }
  assert.throws(() => disabledBookingTimesFromForm(new FormData()));
  assert.deepEqual(parseDisabledBookingTimes(["20:00", "09:00", "09:00"]), [
    "09:00",
    "20:00",
  ]);
  for (const value of [null, "09:00", {}, [9], ["24:00"]])
    assert.throws(() => parseDisabledBookingTimes(value));
});
test("student slots hide closed starts and prevent booking while availability is unavailable", () => {
  const result = desktopBookingSlots("2026-10-24", 3, course, [], now, {
    key: "2026-10-24:3",
    slots: null,
    disabledTimes: ["09:00", "12:30", "20:00"],
  });
  assert.equal(result.length, 20);
  assert.equal(
    result.some((slot) => ["09:00", "12:30", "20:00"].includes(slot.time)),
    false,
  );
  assert.equal(
    result.find((slot) => slot.time === "12:00")?.label,
    "예약 불가",
  );
  assert.equal(
    desktopBookingSlots("2026-10-24", 9, course, [], now, {
      key: "2026-10-24:9",
      slots: null,
      disabledTimes: BOOKING_START_TIMES,
    }).length,
    0,
  );
});
test("SQL disabled flags are hidden and old selections do not affect a different date or duration", () => {
  const availability = {
    key: "2026-10-24:3",
    slots: [
      {
        start_time: "2026-10-24T09:00:00+09:00",
        available: false,
        reason: "disabled",
      },
    ],
  };
  assert.equal(
    desktopBookingSlots("2026-10-24", 3, course, [], now, availability).some(
      (slot) => slot.time === "09:00",
    ),
    false,
  );
  assert.equal(
    desktopBookingSlots("2026-10-24", 6, course, [], now, availability).length,
    23,
  );
  assert.equal(
    desktopBookingSlots("2026-10-25", 3, course, [], now, availability).length,
    23,
  );
});

test("settings route validates all choices before one tenant-scoped atomic write", async () => {
  const writes: any[] = [];
  const { action } = loadMockedModule<{
    action: (args: { request: Request }) => Promise<any>;
  }>(
    new URL("../app/features/admin/api/settings/update.tsx", import.meta.url),
    {
      "../../../app-settings/cancellation-policy": cancellation,
      "../../../app-settings/booking-policy": bookingPolicy,
      "../../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => bookingPolicy.DEFAULT_BOOKING_POLICY,
      },
      "../../../app-settings/booking-window": bookingWindow,
      "../../app-settings/booking-window": bookingWindow,
      "../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => bookingPolicy.DEFAULT_BOOKING_POLICY,
      },
      "../utils/student-schedule-rules": { parseDateString },
      "../utils/kst": { toKSTDateString: realKstDate },
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
        redirect: (url: string) => ({ redirect: url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            from: () => ({
              upsert: async (rows: unknown, options: unknown) => {
                writes.push({ rows, options });
                return { error: null };
              },
            }),
          },
        ],
      },
      "~/features/app-settings/booking-times": {
        DISABLED_BOOKING_TIMES_KEY: "disabled_booking_start_times",
        disabledBookingTimesFromForm,
      },
      "~/features/app-settings/booking-days": {
        DISABLED_BOOKING_DAYS_KEY,
        disabledBookingDaysFromForm,
      },
      "~/features/app-settings/schema": {
        SETTING_KEYS: {
          MAX_CONCURRENT_STUDENTS: "max_concurrent_students",
          SCHEDULE_DURATION_HOURS: "schedule_duration_hours",
          TIME_SLOT_INTERVAL_MINUTES: "time_slot_interval_minutes",
        },
      },
      "../../guards.server": {
        requireAdminRole: async () => ({ organizationId: "org-a" }),
      },
    },
  );
  const request = (allowed: string[], days: string[] | null = ["6", "0"]) => {
    const body = form(allowed);
    if (days !== null) {
      body.set("booking_days_present", "1");
      days.forEach((day) => body.append("disabled_weekdays", day));
    }
    body.set("max_concurrent_students", "5");
    for (const [k, v] of Object.entries(bookingPolicy.DEFAULT_BOOKING_POLICY))
      body.set(k, Array.isArray(v) ? v.join(",") : String(v));
    return new Request("http://localhost/api/admin/settings", {
      method: "POST",
      body,
    });
  };
  assert.equal(
    (await action({ request: request(["12:15"]) })).init.status,
    400,
  );
  assert.equal(writes.length, 0);
  for (const days of [null, ["7"], ["-1"], ["1.5"], ["oops"]]) {
    assert.equal(
      (await action({ request: request([], days) })).init.status,
      400,
    );
  }
  assert.equal(writes.length, 0);
  assert.equal(
    (await action({ request: request([]) })).redirect,
    "/admin/settings",
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].rows.length, 6);
  assert.ok(
    writes[0].rows.every((row: any) => row.organization_id === "org-a"),
  );
  assert.deepEqual(
    Array.from(writes[0].rows[2].setting_value.value),
    BOOKING_START_TIMES,
  );
  assert.equal(writes[0].rows[3].setting_key, DISABLED_BOOKING_DAYS_KEY);
  assert.deepEqual(Array.from(writes[0].rows[3].setting_value.value), [6, 0]);
  await action({ request: request(BOOKING_START_TIMES, []) });
  assert.deepEqual(Array.from(writes[1].rows[3].setting_value.value), []);
});

test("availability failures retain restrictions and settings query failures never enable everything", async () => {
  let fail = false;
  const { loader } = loadMockedModule<{
    loader: (args: { request: Request }) => Promise<any>;
  }>(
    new URL(
      "../app/features/schedules/api/booking-availability.tsx",
      import.meta.url,
    ),
    {
      "../../../app-settings/cancellation-policy": cancellation,
      "../../../app-settings/booking-policy": bookingPolicy,
      "../../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => bookingPolicy.DEFAULT_BOOKING_POLICY,
      },
      "../../../app-settings/booking-window": bookingWindow,
      "../../app-settings/booking-window": bookingWindow,
      "../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => bookingPolicy.DEFAULT_BOOKING_POLICY,
      },
      "../utils/student-schedule-rules": { parseDateString },
      "../utils/kst": { toKSTDateString: realKstDate },
      "react-router": { data: (body: unknown) => body },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            from: () => {
              const query: any = {
                select: () => query,
                eq: () => query,
                single: async () => ({
                  data: { organization_id: "org-a" },
                  error: null,
                }),
              };
              return query;
            },
            rpc: async () => ({ error: { code: "PGRST202" } }),
          },
          new Headers(),
        ],
        getSessionUser: async () => ({ id: "auth-a" }),
      },
      "~/features/users/queries": {
        getUserProfile: async () => ({ profile_id: "student-a" }),
      },
      "~/features/app-settings/queries": {
        getDisabledBookingDays: async (
          _client: unknown,
          { organizationId }: { organizationId: string },
        ) => {
          assert.equal(organizationId, "org-a");
          if (fail) throw new Error("query_failed");
          return [6, 0];
        },
        getDisabledBookingTimes: async (
          _client: unknown,
          { organizationId }: { organizationId: string },
        ) => {
          assert.equal(organizationId, "org-a");
          if (fail) throw new Error("query_failed");
          return ["09:00"];
        },
      },
    },
    {
      URL,
      Date: class extends Date {
        constructor(value?: string | number) {
          super(value ?? "2026-10-23T00:00:00Z");
        }
      },
    },
  );
  const request = new Request(
    "http://localhost/api/schedules/availability?date=2026-10-24&hours=3",
  );
  const result = await loader({ request });
  assert.equal(result.slots, null);
  assert.deepEqual(result.disabledTimes, ["09:00"]);
  assert.deepEqual(result.disabledDays, [6, 0]);
  fail = true;
  await assert.rejects(loader({ request }), /query_failed/);
});
