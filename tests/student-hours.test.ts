import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";

import { getStudentHoursTotals } from "../app/features/schedules/utils/student-hours.ts";

function mockClient(fetch: typeof globalThis.fetch) {
  return createClient("https://example.supabase.co", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as never;
}
test("hours aggregate receives the organization and returns totals without fetching history", async () => {
  let calls = 0;
  const client = mockClient(async (input, init) => {
    calls += 1;
    assert.match(String(input), /\/rpc\/get_student_attended_hours$/);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      p_student_ids: ["student-a"],
      p_organization_id: "org-a",
    });
    return new Response('[{"student_id":"student-a","total_hours":4500.5}]', {
      headers: { "content-type": "application/json" },
    });
  });
  assert.deepEqual(
    await getStudentHoursTotals(client, {
      organizationId: "org-a",
      studentIds: ["student-a"],
    }),
    { "student-a": 4500.5 },
  );
  assert.equal(calls, 1);
});

test("hours fallback paginates legacy history and preserves org scope when migration is absent", async () => {
  const requests: URL[] = [];
  const client = mockClient(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/rpc/")) {
      return new Response(
        '{"code":"PGRST202","message":"Function not in schema cache"}',
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    requests.push(url);
    assert.equal(url.searchParams.get("organization_id"), "eq.org-a");
    assert.equal(url.searchParams.get("student_id"), "in.(student-a)");
    assert.equal(url.searchParams.get("attendance_status"), "eq.PRESENT");
    assert.equal(url.searchParams.get("cancelled_at"), "is.null");
    assert.equal(url.searchParams.get("order"), "schedule_id.asc");
    assert.match(url.searchParams.get("end_time")!, /^lte\./);
    assert.equal(url.searchParams.get("start_time"), null);
    const offset = Number(url.searchParams.get("offset"));
    const length = offset < 1000 ? 500 : 3;
    const schedules = Array.from({ length }, () => ({
      student_id: "student-a",
      start_time: "2026-08-03T01:00:00.000Z",
      end_time: "2026-08-03T04:00:00.000Z",
    }));
    return new Response(JSON.stringify(schedules), {
      headers: { "content-type": "application/json" },
    });
  });
  assert.deepEqual(
    await getStudentHoursTotals(client, {
      organizationId: "org-a",
      studentIds: ["student-a"],
    }),
    { "student-a": 3009 },
  );
  assert.equal(requests.length, 3);
});

test("hours calculation propagates permission errors instead of trying an alternate query", async () => {
  let calls = 0;
  const client = mockClient(async () => {
    calls += 1;
    return new Response('{"code":"42501","message":"permission denied"}', {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  });
  await assert.rejects(
    getStudentHoursTotals(client, { studentIds: ["student-a"] }),
    { code: "42501" },
  );
  assert.equal(calls, 1);
});
