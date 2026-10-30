import assert from "node:assert/strict";
import test from "node:test";

import * as policy from "../app/features/app-settings/booking-policy.ts";
import * as kst from "../app/features/schedules/utils/kst.ts";
import * as rules from "../app/features/schedules/utils/student-schedule-rules.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const custom = {
  ...policy.DEFAULT_BOOKING_POLICY,
  durationMinutes: [40, 50],
  defaultDurationMinutes: 40,
  startIntervalMinutes: 50,
};
function adminRoute(update = false) {
  const writes: any[] = [];
  const route = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL(
      `../app/features/admin/api/schedules/${update ? "update" : "create"}.tsx`,
      import.meta.url,
    ),
    {
      "react-router": {
        data: (body: any, init: any) => ({ body, init }),
        redirect: (url: string) => ({ url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            rpc: async (name: string, args: any) => {
              writes.push({ name, args });
              return { error: null };
            },
          },
          new Headers(),
        ],
      },
      "../../../app-settings/booking-policy": policy,
      "../../../programs/booking-policy.server": {
        getProgramBookingPolicy: async (
          _: unknown,
          {
            organizationId,
            programId,
          }: { organizationId: string; programId: number },
        ) => {
          assert.equal(organizationId, "org-a");
          if (!Number.isSafeInteger(programId) || programId < 1)
            throw new Error("schedule_program_required");
          if (programId !== 1) throw new Error("schedule_program_not_eligible");
          return { policy: custom };
        },
      },
      "../../guards.server": {
        requireAdminRole: async () => ({ organizationId: "org-a" }),
      },
      "../../queries": {
        getStudentById: async () => ({
          name: "Fixture",
          class_end_date: "2099-12-31",
        }),
      },
      "~/features/schedules/utils/student-schedule-rules": rules,
      "~/features/schedules/utils/kst": kst,
      "~/features/schedules/utils/rrule-helper": {
        generateWeeklyDates: () => [],
      },
      "~/features/schedules/utils/schedule-validation": {
        shiftScheduleOccurrences: () => [],
      },
      "~/features/schedules/queries": {
        validateScheduleBatch: async () => ({ allowed: true }),
        getScheduleById: async () => ({
          schedule_id: 1,
          program_id: 1,
          start_time: "2099-01-01T21:15:00+09:00",
          end_time: "2099-01-02T00:15:00+09:00",
        }),
      },
    },
  );
  const run = (values: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries({
      student_id: "fixture",
      program_id: "1",
      date: "2099-01-01",
      start_time: "09:50",
      ...values,
    }))
      form.set(k, v);
    return route.action({
      request: new Request("https://lestly.test/api/admin/schedules/create", {
        method: "POST",
        body: form,
      }),
      params: { scheduleId: "1" },
    });
  };
  return { writes, run };
}
test("admin creation uses the selected minute length and rejects missing, unlisted or malformed values before writing", async () => {
  const f = adminRoute();
  assert.equal(
    (await f.run({ duration_minutes: "40" })).url,
    "/admin/schedules",
  );
  const row = f.writes[0].args.p_rows[0];
  assert.equal(
    Date.parse(row.end_time) - Date.parse(row.start_time),
    40 * 60_000,
  );
  assert.equal(row.start_time, "2099-01-01T00:50:00.000Z");
  for (const values of [
    {},
    { duration_minutes: "180" },
    { duration_minutes: "oops" },
    { duration_minutes: "40", date: "2099-02-30" },
    { duration_minutes: "40", start_time: "24:00" },
  ])
    assert.equal(
      (await f.run(values as Record<string, string>)).init.status,
      400,
    );
  assert.equal(f.writes.length, 1);
});
test("editing an existing removed duration preserves its exact length without allowing another unlisted length", async () => {
  const f = adminRoute(true);
  assert.equal(
    (await f.run({ duration_minutes: "180", start_time: "21:15" })).url,
    "/admin/schedules",
  );
  const row = f.writes[0].args.p_rows[0];
  assert.equal(
    Date.parse(row.end_time) - Date.parse(row.start_time),
    180 * 60_000,
  );
  assert.equal((await f.run({ duration_minutes: "120" })).init.status, 400);
  assert.equal(f.writes.length, 1);
});

test("admin booking requires an eligible class before any write and a class change cannot retain an unlisted legacy length", async () => {
  const f = adminRoute();
  for (const program_id of ["", "0", "1junk", "999"])
    assert.equal(
      (await f.run({ duration_minutes: "40", program_id })).init.status,
      400,
    );
  assert.equal(f.writes.length, 0);
});
