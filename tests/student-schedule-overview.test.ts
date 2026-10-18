import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  getStudentScheduleOverview,
  getStudentSchedulePeriods,
} from "../app/features/admin/utils/student-schedule-overview.ts";

function mockClient(fetch: typeof globalThis.fetch) {
  return createClient("https://example.supabase.co", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as never;
}

function row(id: number, start: string) {
  return {
    schedule_id: id,
    start_time: start,
    end_time: new Date(Date.parse(start) + 3_600_000).toISOString(),
    program: { program_id: 1, title: "수업" },
  };
}

test("detail reads overlapping panels once with organization and student filters", async () => {
  let calls = 0;
  const rows = [
    row(1, "2026-04-26T00:00:00+09:00"),
    row(2, "2026-04-30T23:59:59.999+09:00"),
    row(3, "2026-05-01T00:00:00+09:00"),
    row(4, "2026-05-02T23:59:59.999+09:00"),
    row(5, "2026-05-03T00:00:00+09:00"),
    row(6, "2026-05-09T23:59:59.999+09:00"),
    row(7, "2026-05-10T00:00:00+09:00"),
    row(8, "2026-05-31T23:59:59.999+09:00"),
    row(9, "2026-06-01T00:00:00+09:00"),
    row(10, "2026-06-30T23:59:59.999+09:00"),
  ];
  const client = mockClient(async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, "/rest/v1/schedules");
    assert.equal(url.searchParams.get("organization_id"), "eq.org-a");
    assert.equal(url.searchParams.get("student_id"), "eq.student-a");
    assert.deepEqual(url.searchParams.getAll("start_time"), [
      "gte.2026-04-25T15:00:00.000Z",
      "lt.2026-06-30T15:00:00.000Z",
    ]);
    assert.equal(
      url.searchParams.get("order"),
      "start_time.asc,schedule_id.asc",
    );
    assert.ok(!url.searchParams.get("select")?.includes("*"));
    assert.match(
      url.searchParams.get("select")!,
      /programs!schedules_program_id_programs_program_id_fk/,
    );
    return Response.json(rows);
  });
  const result = await getStudentScheduleOverview(client, {
    organizationId: "org-a",
    studentId: "student-a",
    now: new Date("2026-05-01T03:00:00Z"),
  });
  const ids = (schedules: { schedule_id: number }[]) =>
    schedules.map((s) => s.schedule_id);
  assert.equal(calls, 1);
  assert.deepEqual(ids(result.weeklySchedules), [1, 2, 3, 4]);
  assert.deepEqual(ids(result.nextWeekSchedules), [5, 6]);
  assert.deepEqual(ids(result.monthlySchedules), [3, 4, 5, 6, 7, 8]);
  assert.deepEqual(ids(result.nextMonthSchedules), [9, 10]);
  assert.equal(result.currentMonth, 5);
  assert.equal(result.nextMonth, 6);
});

test("periods handle KST midnight, leap days and December to January", () => {
  const leap = getStudentSchedulePeriods(new Date("2024-02-28T15:00:00Z"));
  assert.equal(leap.monthStart.toISOString(), "2024-01-31T15:00:00.000Z");
  assert.equal(leap.nextMonthStart.toISOString(), "2024-02-29T15:00:00.000Z");
  const december = getStudentSchedulePeriods(new Date("2026-12-31T03:00:00Z"));
  assert.equal(december.currentYear, 2026);
  assert.equal(december.currentMonth, 12);
  assert.equal(december.nextMonthYear, 2027);
  assert.equal(december.nextMonth, 1);
  assert.equal(december.queryEnd.toISOString(), "2027-01-31T15:00:00.000Z");
  const january = getStudentSchedulePeriods(new Date("2026-12-31T15:00:00Z"));
  assert.equal(january.currentYear, 2027);
  assert.equal(january.currentMonth, 1);
  assert.equal(january.queryStart.toISOString(), "2026-12-26T15:00:00.000Z");
});

test("Sunday belongs to the new week and the two-month boundary stays exclusive", async () => {
  const client = mockClient(async () =>
    Response.json([
      row(1, "2026-10-18T00:00:00+09:00"),
      row(2, "2026-10-25T00:00:00+09:00"),
      row(3, "2026-11-01T00:00:00+09:00"),
      row(4, "2026-12-01T00:00:00+09:00"),
    ]),
  );
  const result = await getStudentScheduleOverview(client, {
    organizationId: "org-a",
    studentId: "student-a",
    now: new Date("2026-10-17T15:00:00Z"),
  });
  assert.deepEqual(
    result.weeklySchedules.map((s) => s.schedule_id),
    [1],
  );
  assert.deepEqual(
    result.nextWeekSchedules.map((s) => s.schedule_id),
    [2],
  );
  assert.deepEqual(
    result.nextMonthSchedules.map((s) => s.schedule_id),
    [3],
  );
});

test("large periods paginate without truncation and retain stable ordering", async () => {
  const offsets: number[] = [];
  const client = mockClient(async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset"));
    offsets.push(offset);
    assert.equal(url.searchParams.get("limit"), "500");
    assert.equal(url.searchParams.get("organization_id"), "eq.org-a");
    return Response.json(
      Array.from({ length: offset < 1000 ? 500 : 3 }, (_, i) =>
        row(offset + i, "2026-10-18T01:00:00Z"),
      ),
    );
  });
  const result = await getStudentScheduleOverview(client, {
    organizationId: "org-a",
    studentId: "student-a",
    now: new Date("2026-10-18T00:00:00Z"),
  });
  assert.deepEqual(offsets, [0, 500, 1000]);
  assert.equal(result.monthlySchedules.length, 1003);
  assert.equal(
    new Set(result.monthlySchedules.map((s) => s.schedule_id)).size,
    1003,
  );
});

test("empty periods remain empty and failed queries are not shown as empty schedules", async () => {
  const params = { organizationId: "org-a", studentId: "student-a" };
  const empty = await getStudentScheduleOverview(
    mockClient(async () => Response.json([])),
    params,
  );
  assert.deepEqual(empty.weeklySchedules, []);
  assert.deepEqual(empty.monthlySchedules, []);
  await assert.rejects(
    getStudentScheduleOverview(
      mockClient(async () =>
        Response.json(
          { code: "42501", message: "permission denied" },
          { status: 403 },
        ),
      ),
      params,
    ),
    { code: "42501" },
  );
});
