import assert from "node:assert/strict";
import test from "node:test";

import { loadMockedModule } from "./helpers/mocked-module.ts";

function handler({
  schedule = true,
  allow = true,
  deleted = true,
  error = false,
}: {
  schedule?: boolean;
  allow?: boolean;
  deleted?: boolean;
  error?: boolean;
} = {}) {
  let deletes = 0;
  const pushes: unknown[][] = [];
  const filters: any[] = [];
  const client = {
    from(table: string) {
      let mutation = false;
      const builder: any = {
        select() {
          return builder;
        },
        is(key: string, value: unknown) {
          assert.equal(key, "cancelled_at");
          assert.equal(value, null);
          return this;
        },
        eq(key: string, value: unknown) {
          filters.push({ table, key, value });
          return builder;
        },
        delete() {
          mutation = true;
          deletes++;
          return builder;
        },
        single: async () => ({ data: { profile_id: "stable-student" } }),
        maybeSingle: async () =>
          table === "schedules" && mutation
            ? {
                data: deleted ? { schedule_id: 1 } : null,
                error: error ? { code: "42501" } : null,
              }
            : {
                data: schedule
                  ? { schedule_id: 1, start_time: "2099-01-01T01:00:00Z" }
                  : null,
              },
      };
      return builder;
    },
  };
  const route = loadMockedModule<{ action: (args: any) => Promise<any> }>(
    new URL(
      "../app/features/schedules/api/delete-schedule.tsx",
      import.meta.url,
    ),
    {
      "~/features/notifications/push/dispatch.server": {
        dispatchSchedulePush: async (...args: unknown[]) => {
          pushes.push(args);
        },
      },
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
        redirect: (url: string) => ({ url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [client, new Headers()],
        getSessionUser: async () => ({ id: "auth-user" }),
      },
      "~/features/schedules/utils/student-schedule-rules": {
        canStudentCancelSchedule: () => allow,
      },
    },
  );
  return {
    run: (id = "1") =>
      route.action({
        request: new Request("https://example.test/api/schedules/1/delete", {
          method: "POST",
        }),
        params: { scheduleId: id },
      }),
    deletes: () => deletes,
    pushes,
    filters,
  };
}

test("cancel handler validates IDs, own schedule and deadline before deleting", async () => {
  const malformed = handler();
  assert.equal((await malformed.run("1suffix")).body.success, false);
  assert.equal(malformed.deletes(), 0);
  const missing = handler({ schedule: false });
  assert.equal((await missing.run()).body.success, false);
  assert.equal(missing.deletes(), 0);
  const sameDay = handler({ allow: false });
  assert.match((await sameDay.run()).body.error, /당일/);
  assert.equal(sameDay.deletes(), 0);
});

test("cancel failures and RLS no-row results are returned inline rather than reported as success", async () => {
  for (const options of [{ deleted: false }, { error: true }]) {
    const result = await handler(options).run();
    assert.equal(result.body.success, false);
    assert.match(result.body.error, /취소하지 못/);
  }
  const success = handler();
  assert.equal((await success.run()).body.success, true);
  assert.equal(success.deletes(), 1);
  assert.deepEqual(success.pushes, [[1, "stable-student"]]);
  assert.equal(
    success.filters.filter(
      (f) => f.key === "student_id" && f.value === "stable-student",
    ).length,
    2,
  );
});
