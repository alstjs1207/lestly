import assert from "node:assert/strict";
import test from "node:test";

import * as days from "../app/features/app-settings/booking-days.ts";
import * as policy from "../app/features/app-settings/booking-policy.ts";
import * as times from "../app/features/app-settings/booking-times.ts";
import * as window from "../app/features/app-settings/booking-window.ts";
import * as cancellation from "../app/features/app-settings/cancellation-policy.ts";
import * as settingsSections from "../app/features/app-settings/settings-sections.ts";
import * as bookingOrganization from "../app/features/schedules/utils/booking-organization.server.ts";
import * as kst from "../app/features/schedules/utils/kst.ts";
import * as rules from "../app/features/schedules/utils/student-schedule-rules.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const rolling = {
  ...policy.DEFAULT_BOOKING_POLICY,
  bookingWindow: { mode: "rolling", daysAhead: 14 } as const,
  cancellationPolicy: { mode: "hours_before", hours: 3 } as const,
};
const now = new Date("2026-10-29T08:00:00+09:00");
class FixedDate extends Date {
  constructor(value?: string | number) {
    super(value ?? +now);
  }
  static now() {
    return +now;
  }
}

test("settings write one exclusive window atomically and legacy open forms preserve the latest saved window", async () => {
  const writes: any[] = [];
  let reads = 0;
  const { action } = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL("../app/features/admin/api/settings/update.tsx", import.meta.url),
    {
      "../../app-settings/cancellation-policy": cancellation,
      "react-router": {
        data: (body: any, init: any) => ({ body, init }),
        redirect: (url: string) => ({ url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            from: (name: string) => {
              assert.equal(name, "settings");
              return {
                upsert: async (rows: any, options: any) => {
                  writes.push({ rows, options });
                  return { error: null };
                },
              };
            },
          },
        ],
      },
      "~/features/app-settings/booking-days": days,
      "~/features/app-settings/booking-times": times,
      "~/features/app-settings/schema": {
        SETTING_KEYS: { MAX_CONCURRENT_STUDENTS: "max_concurrent_students" },
      },
      "../../../app-settings/settings-sections": settingsSections,
      "../../../app-settings/booking-policy": policy,
      "../../../app-settings/booking-window": window,
      "../../../app-settings/cancellation-policy": cancellation,
      "../../../app-settings/booking-policy.server": {
        getBookingPolicy: async (_: any, { organizationId }: any) => {
          assert.equal(organizationId, "org-a");
          reads++;
          return rolling;
        },
      },
      "../../guards.server": {
        requireAdminRole: async () => ({ organizationId: "org-a" }),
      },
    },
  );
  const run = (values: Record<string, string>, legacy = false) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...policy.DEFAULT_BOOKING_POLICY,
      max_concurrent_students: "5",
      booking_times_present: "1",
      booking_days_present: "1",
      cancellationMode: "previous_day",
    }))
      if (key !== "bookingWindow" && key !== "cancellationPolicy")
        form.set(key, Array.isArray(value) ? value.join(",") : String(value));
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    if (legacy) form.delete("cancellationMode");
    return action({
      request: new Request("https://lestly.test/api/admin/settings", {
        method: "POST",
        body: form,
      }),
    });
  };
  assert.equal(
    (
      await run({
        bookingWindowMode: "monthly",
        bookingOpeningDay: "31",
        bookingDaysAhead: "bad",
      })
    ).url,
    "/admin/settings",
  );
  assert.deepEqual(writes[0].rows[4].setting_value, {
    mode: "monthly",
    openingDay: 31,
  });
  assert.equal(
    (
      await run({
        bookingWindowMode: "rolling",
        bookingDaysAhead: "0",
        bookingOpeningDay: "bad",
      })
    ).url,
    "/admin/settings",
  );
  assert.deepEqual(writes[1].rows[4].setting_value, {
    mode: "rolling",
    daysAhead: 0,
  });
  assert.equal(reads, 0);
  assert.equal((await run({}, true)).url, "/admin/settings");
  assert.equal(reads, 1);
  assert.deepEqual(writes[2].rows[4].setting_value, rolling.bookingWindow);
  assert.deepEqual(writes[2].rows[5].setting_value, rolling.cancellationPolicy);
  const invalid: Record<string, string>[] = [
    {
      bookingWindowMode: "monthly",
      bookingOpeningDay: "25",
      cancellationMode: "both",
    },
    {
      bookingWindowMode: "monthly",
      bookingOpeningDay: "25",
      cancellationMode: "hours_before",
      cancellationHours: "721",
    },
    { bookingWindowMode: "both" },
    { bookingWindowMode: "" },
    { bookingWindowMode: "monthly", bookingOpeningDay: "32" },
    { bookingWindowMode: "monthly", bookingOpeningDay: "" },
    { bookingWindowMode: "rolling", bookingDaysAhead: "366" },
    { bookingWindowMode: "rolling", bookingDaysAhead: "1.5" },
  ];
  for (const values of invalid)
    assert.equal((await run(values)).init.status, 400);
  assert.equal(writes.length, 3);
  for (const write of writes) {
    assert.equal(write.rows.length, 6);
    assert.equal(
      Object.hasOwn(write.rows[1].setting_value, "bookingWindow"),
      false,
    );
    assert.ok(write.rows.every((r: any) => r.organization_id === "org-a"));
    assert.equal(write.options.onConflict, "organization_id,setting_key");
  }
});

function studentRoutes(
  resolvedPolicy: policy.BookingPolicy = rolling,
  reject = "",
) {
  const calls: any[] = [];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({
      data: { profile_id: "student-a", organization_id: "org-a" },
      error: null,
    }),
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "auth-a" } } }) },
    from: () => chain,
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return {
        data: name === "book_student_schedule_with_policy" ? 42 : [],
        error: reject ? { message: reject } : null,
      };
    },
  };
  chain.maybeSingle = chain.single;
  const shared: any = {
    "../utils/booking-organization.server": bookingOrganization,
    "../../app-settings/cancellation-policy": cancellation,
    "react-router": {
      data: (body: any, init: any) => ({ body, init }),
      redirect: (url: string) => ({ url }),
    },
    "~/core/lib/supa-client.server": {
      default: () => [client, new Headers()],
      getSessionUser: async () => ({ id: "auth-a" }),
    },
    "../../programs/booking-policy.server": {
      getProgramBookingPolicy: async () => ({ policy: resolvedPolicy }),
    },
    "../utils/kst": kst,
  };
  const create = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL(
      "../app/features/schedules/api/create-schedule.tsx",
      import.meta.url,
    ),
    {
      ...shared,
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/features/schedules/utils/student-schedule-rules": rules,
      "../../app-settings/booking-policy": policy,
      "~/features/notifications/push/dispatch.server": {
        dispatchSchedulePush: async () => {},
      },
    },
    { Date: FixedDate },
  );
  const available = loadMockedModule<{ loader(args: any): Promise<any> }>(
    new URL(
      "../app/features/schedules/api/booking-availability.tsx",
      import.meta.url,
    ),
    {
      ...shared,
      "../../app-settings/booking-window": window,
      "../utils/student-schedule-rules": rules,
      "~/features/users/queries": {
        getUserProfile: async () => ({ profile_id: "student-a" }),
      },
      "~/features/app-settings/queries": {
        getDisabledBookingTimes: async () => [],
        getDisabledBookingDays: async () => [],
      },
    },
    { Date: FixedDate, URL },
  );
  return {
    calls,
    create: async (date: string, values: Record<string, string> = {}) => {
      const form = new FormData();
      form.set("date", date);
      form.set("program_id", "1");
      form.set("start_time", "09:00");
      form.set("duration_minutes", "180");
      form.set(
        "cancellation_policy",
        JSON.stringify(resolvedPolicy.cancellationPolicy),
      );
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      return create.action({
        request: new Request("https://lestly.test/api/schedules/create", {
          method: "POST",
          body: form,
        }),
      });
    },
    available: async (date: string) =>
      available.loader({
        request: new Request(
          `https://lestly.test/api/schedules/availability?program_id=1&date=${date}&minutes=180`,
        ),
      }),
  };
}
test("student create API forwards the final allowed day and rejects the following day before any booking", async () => {
  const f = studentRoutes();
  assert.equal((await f.create("2026-11-12")).body.success, true);
  assert.equal((await f.create("2026-11-13")).init.status, 400);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, "book_student_schedule_with_policy");
  assert.equal(f.calls[0].args.p_start_time, "2026-11-12T00:00:00.000Z");
});
test("availability API returns the latest policy for a newly closed date without offering slots or caching it", async () => {
  const f = studentRoutes();
  const closed = await f.available("2026-11-13");
  assert.equal(closed.body.slots.length, 0);
  assert.deepEqual(closed.body.bookingPolicy, rolling);
  assert.equal(closed.init.headers.get("Cache-Control"), "private, no-store");
  assert.equal(f.calls.length, 0);
  await f.available("2026-11-12");
  assert.equal(f.calls[0].name, "get_student_program_booking_availability");
});

test("student booking requires the exact displayed cancellation policy and explicit acknowledgement after cutoff", async () => {
  const long = {
    ...rolling,
    cancellationPolicy: { mode: "hours_before", hours: 720 } as const,
  };
  const f = studentRoutes(long);
  assert.equal(
    (await f.create("2026-10-30", { cancellation_policy: "null" })).init.status,
    409,
  );
  assert.equal(
    (
      await f.create("2026-10-30", {
        cancellation_policy: JSON.stringify(
          cancellation.DEFAULT_CANCELLATION_POLICY,
        ),
      })
    ).init.status,
    409,
  );
  assert.equal((await f.create("2026-10-30")).init.status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.create("2026-10-30", { accept_no_cancellation: "1" })).body
      .success,
    true,
  );
  assert.deepEqual(
    f.calls[0].args.p_expected_cancellation_policy,
    long.cancellationPolicy,
  );
  assert.equal(f.calls[0].args.p_accept_no_cancellation, true);
  for (const error of [
    "schedule_cancellation_policy_changed",
    "schedule_cancellation_ack_required",
  ]) {
    const stale = studentRoutes(long, error);
    assert.equal(
      (await stale.create("2026-10-30", { accept_no_cancellation: "1" })).body
        .success,
      false,
    );
  }
});
