import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import {
  attendanceDate,
  attendanceFailure,
  parseAttendanceChanges,
} from "../app/features/attendance/lib/attendance.ts";
import {
  getAttendanceSchedules,
  saveAttendance,
} from "../app/features/attendance/queries.server.ts";
import { completedSchedules } from "../app/features/schedules/utils/learning-records.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const now = new Date("2026-10-25T16:00:00Z");
const valid = { schedule_id: 12, version: 3, status: "ABSENT" };

test("attendance input keeps exact occurrence IDs and rejects duplicates, invalid versions and oversized batches", () => {
  assert.deepEqual(
    parseAttendanceChanges([
      { ...valid, organization_id: "untrusted", student_id: "ignored" },
    ]),
    [valid],
  );
  for (const value of [
    null,
    {},
    [],
    [valid, valid],
    [{ ...valid, schedule_id: "12" }],
    [{ ...valid, version: -1 }],
    [{ ...valid, status: "CANCELLED" }],
    Array.from({ length: 201 }, (_, i) => ({ ...valid, schedule_id: i + 1 })),
  ])
    assert.throws(() => parseAttendanceChanges(value));
  assert.equal(attendanceDate(null, now), "2026-10-26");
  assert.equal(attendanceDate("2024-02-29"), "2024-02-29");
  for (const date of [
    "2026-02-29",
    "2026-10-32",
    "2026-2-01",
    "bad",
    "1999-01-01",
  ])
    assert.throws(() => attendanceDate(date));
});

test("only ended, confirmed PRESENT lessons count; historical PENDING is not inferred", () => {
  const past = {
    start_time: "2026-10-25T01:00:00Z",
    end_time: "2026-10-25T04:00:00Z",
  };
  const rows = [
    past,
    { ...past, attendance_status: "PENDING" },
    { ...past, attendance_status: "ABSENT" },
    { ...past, attendance_status: "PRESENT" },
    { ...past, end_time: "2026-10-26T04:00:00Z", attendance_status: "PRESENT" },
  ];
  assert.deepEqual(completedSchedules(rows, now), [rows[3]]);
});

function mockClient(fetch: typeof globalThis.fetch) {
  return createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as never;
}

test("daily attendance includes cancelled reservations, while pending view covers all past dates and pages safely", async () => {
  const urls: URL[] = [];
  const client = mockClient(async (input) => {
    urls.push(new URL(String(input)));
    return Response.json([], { headers: { "content-range": "0-0/0" } });
  });
  await getAttendanceSchedules(client, {
    organizationId: "trusted",
    date: "2026-10-25",
    pendingOnly: false,
    page: 1,
    now,
  });
  await getAttendanceSchedules(client, {
    organizationId: "trusted",
    date: "2026-10-25",
    pendingOnly: true,
    page: 3,
    now,
  });
  assert.deepEqual(urls[0].searchParams.getAll("start_time"), [
    "gte.2026-10-24T15:00:00.000Z",
    "lt.2026-10-25T15:00:00.000Z",
  ]);
  assert.equal(urls[0].searchParams.has("cancelled_at"), false);
  assert.equal(
    urls[1].searchParams.get("start_time"),
    `lte.${now.toISOString()}`,
  );
  assert.equal(urls[1].searchParams.get("attendance_status"), "eq.PENDING");
  assert.equal(urls[1].searchParams.get("offset"), "100");
  for (const url of urls)
    assert.equal(url.searchParams.get("organization_id"), "eq.trusted");
});

test("save endpoint uses the authenticated organization, bounds JSON and forwards only validated changes", async () => {
  const calls: unknown[] = [];
  const client = mockClient(async (input, init) => {
    assert.match(String(input), /rpc\/save_attendance$/);
    calls.push(JSON.parse(String(init?.body)));
    return Response.json(1);
  });
  const handler = loadMockedModule<{ action(args: unknown): Promise<any> }>(
    new URL(
      "../app/features/attendance/screens/attendance.tsx",
      import.meta.url,
    ),
    {
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/request-body": { RequestBodyError, readBoundedJson },
      "~/core/lib/supa-client.server": {
        default: () => [client, new Headers()],
      },
      "~/features/admin/guards.server": {
        requireAdminRole: async () => ({ organizationId: "trusted" }),
      },
      "../lib/attendance": {
        attendanceDate,
        attendanceFailure,
        parseAttendanceChanges,
      },
      "../queries.server": { saveAttendance },
      "../components/attendance-manager": { default: () => null },
    },
  );
  const submit = (body: unknown) =>
    handler.action({
      request: new Request("https://lestly.test/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  assert.equal(
    (await submit([{ ...valid, organization_id: "foreign" }])).body.success,
    true,
  );
  assert.deepEqual(calls, [
    { p_organization_id: "trusted", p_changes: [valid] },
  ]);
  assert.equal((await submit([valid, valid])).init.status, 400);
  assert.equal((await submit("x".repeat(33000))).init.status, 413);
  assert.equal(calls.length, 1);
  assert.equal(
    attendanceFailure({ message: "attendance_conflict" }).status,
    409,
  );
  assert.equal(
    attendanceFailure({ message: "secret database details" }).status,
    500,
  );
  assert.doesNotMatch(
    attendanceFailure({ message: "secret database details" }).error,
    /secret/,
  );
});

test("attendance history uses the authenticated tenant and keeps lookup failures inline", async () => {
  let fail = false;
  const handler = loadMockedModule<{ loader(args: unknown): Promise<any> }>(
    new URL("../app/features/attendance/api/history.tsx", import.meta.url),
    {
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
      },
      "~/core/lib/supa-client.server": { default: () => [{}, new Headers()] },
      "~/features/admin/guards.server": {
        requireAdminRole: async () => ({ organizationId: "trusted" }),
      },
      "../queries.server": {
        getAttendanceHistory: async (
          _client: unknown,
          org: string,
          id: number,
        ) => {
          assert.equal(org, "trusted");
          assert.equal(id, 12);
          if (fail) throw new Error("private database failure");
          return [];
        },
      },
    },
  );
  const load = (id = "12") =>
    handler.loader({
      request: new Request(
        "https://lestly.test/api/admin/attendance/12/history?organization_id=foreign",
      ),
      params: { scheduleId: id },
    });
  assert.equal((await load()).body.events.length, 0);
  assert.equal((await load("1e2")).init.status, 400);
  fail = true;
  const failed = await load();
  assert.equal(failed.init.status, 500);
  assert.doesNotMatch(failed.body.error, /private/);
});
