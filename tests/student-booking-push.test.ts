import assert from "node:assert/strict";
import test from "node:test";

import * as bookingPolicy from "../app/features/app-settings/booking-policy.ts";
import { toKSTDateString as realKstDate } from "../app/features/schedules/utils/kst.ts";
import { parseDateString } from "../app/features/schedules/utils/student-schedule-rules.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function setup(rejectBooking = false) {
  const order: string[] = [];
  const pushes: unknown[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "auth-student" } } }) },
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({
          data:
            table === "profiles"
              ? { profile_id: "student-profile" }
              : { organization_id: "student-org" },
        }),
      };
      return chain;
    },
    rpc: async () => {
      order.push("booking-committed");
      return {
        data: rejectBooking ? null : 42,
        error: rejectBooking ? { message: "schedule_capacity_exceeded" } : null,
      };
    },
  };
  const route = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL(
      "../app/features/schedules/api/create-schedule.tsx",
      import.meta.url,
    ),
    {
      "../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => bookingPolicy.DEFAULT_BOOKING_POLICY,
      },
      "../../app-settings/booking-policy": bookingPolicy,
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
        redirect: (url: string) => ({ url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [client, new Headers()],
      },
      "~/features/schedules/utils/student-schedule-rules": {
        DURATION_OPTIONS: [{ value: "3", hours: 3 }],
        canStudentRegisterSchedule: () => true,
        parseDateString: () => new Date("2099-01-01T00:00:00+09:00"),
        applyTimeToDate: () => new Date("2099-01-01T09:00:00+09:00"),
        calculateEndTime: () => new Date("2099-01-01T12:00:00+09:00"),
      },
      "../utils/kst": { toKSTDateString: () => "2099-01-01" },
      "~/features/notifications/push/dispatch.server": {
        dispatchSchedulePush: async (...args: unknown[]) => {
          order.push("push-dispatched");
          pushes.push(args);
        },
      },
    },
  );
  const form = new FormData();
  for (const [key, value] of Object.entries({
    date: "2099-01-01",
    start_time: "09:00",
    duration_minutes: "180",
    program_id: "1",
  }))
    form.set(key, value);
  return {
    order,
    pushes,
    run: () =>
      route.action({
        request: new Request("https://lestly.test/api/schedules/create", {
          method: "POST",
          body: form,
        }),
      }),
  };
}

test("student booking dispatches only after a successful RPC commit with its authoritative schedule and actor", async () => {
  const state = setup();
  assert.equal((await state.run()).data.success, true);
  assert.deepEqual(state.order, ["booking-committed", "push-dispatched"]);
  assert.deepEqual(state.pushes, [[42, "student-profile"]]);
  const rejected = setup(true);
  assert.equal((await rejected.run()).data.success, false);
  assert.deepEqual(rejected.order, ["booking-committed"]);
  assert.equal(rejected.pushes.length, 0);
});
