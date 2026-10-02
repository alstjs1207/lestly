import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildStudentSearchFilter,
  normalizePagination,
} from "../app/core/lib/query-utils.ts";
import {
  getDashboardStats,
  getStudentById,
  getStudentsPaginated,
} from "../app/features/admin/queries.ts";
import { getPublicProgramBySlug } from "../app/features/class/queries.ts";
import { getProgram, getPrograms } from "../app/features/programs/queries.ts";
import {
  getKSTMonthRange,
  parseCalendarMonth,
} from "../app/features/schedules/utils/calendar-month.ts";
import { getStudentHoursTotals } from "../app/features/schedules/utils/student-hours.ts";
import { getOrganizationsWithStats } from "../app/features/super-admin/queries.ts";

function mockClient(fetch: typeof globalThis.fetch) {
  return createClient("https://example.supabase.co", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as never;
}

test("calendar month uses KST and an exclusive next-month boundary", () => {
  const range = getKSTMonthRange(2026, 12);
  assert.equal(range.startDate.toISOString(), "2026-11-30T15:00:00.000Z");
  assert.equal(range.endDate.toISOString(), "2026-12-31T15:00:00.000Z");
  assert.deepEqual(
    parseCalendarMonth(new URLSearchParams(), new Date("2026-09-30T16:00:00Z")),
    {
      year: 2026,
      month: 10,
    },
  );
  for (const params of [
    "month=13",
    "month=0",
    "year=NaN",
    "year=999999",
    "month=1junk",
    "month=1.5",
  ]) {
    assert.throws(
      () => parseCalendarMonth(new URLSearchParams(params)),
      (error: unknown) => error instanceof Response && error.status === 400,
    );
  }
});

test("pagination rejects invalid offsets and bounds page size", () => {
  for (const page of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(normalizePagination(page), {
      page: 1,
      pageSize: 20,
      from: 0,
      to: 19,
    });
  }
  assert.deepEqual(normalizePagination(2, 1000), {
    page: 2,
    pageSize: 100,
    from: 100,
    to: 199,
  });
});

test("student search treats filter punctuation as a quoted value", async () => {
  const search = 'Kim",phone.eq.anything),name.ilike.(\\';
  const filter = buildStudentSearchFilter(search);
  assert.equal(
    filter,
    'name.ilike."%Kim\\",phone.eq.anything),name.ilike.(\\\\%",phone.ilike."%Kim\\",phone.eq.anything),name.ilike.(\\\\%"',
  );
  let query: URL | undefined;
  const client = mockClient(async (input) => {
    query = new URL(String(input));
    return new Response("[]", {
      headers: { "content-type": "application/json", "content-range": "*/0" },
    });
  });
  await getStudentsPaginated(client, { organizationId: "org-a", search });
  assert.equal(query?.searchParams.get("profiles.or"), `(${filter})`);
  assert.equal(query?.searchParams.get("organization_id"), "eq.org-a");
  assert.equal(query?.searchParams.get("limit"), "20");
});

test("student detail joins its scoped membership and profile in one request", async () => {
  const queries: URL[] = [];
  const client = mockClient(async (input) => {
    queries.push(new URL(String(input)));
    return new Response(
      JSON.stringify({
        role: "STUDENT",
        state: "NORMAL",
        type: "ADULT",
        profiles: { profile_id: "student-a", name: "Kim" },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });
  const student = await getStudentById(client, {
    organizationId: "org-a",
    studentId: "student-a",
  });
  assert.equal(student.name, "Kim");
  assert.equal(student.role, "STUDENT");
  assert.equal(queries.length, 1);
  assert.equal(queries[0].searchParams.get("organization_id"), "eq.org-a");
  assert.equal(queries[0].searchParams.get("profile_id"), "eq.student-a");
  assert.equal(queries[0].searchParams.get("role"), "eq.STUDENT");
});

test("dashboard student counts remain correct above the API row cap without downloading member rows", async () => {
  const client = mockClient(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method, "HEAD");
    assert.equal(url.searchParams.get("organization_id"), "eq.org-a");
    const state = url.searchParams.get("state");
    const count =
      state === "eq.NORMAL"
        ? 1200
        : state === "eq.GRADUATE"
          ? 100
          : state === "eq.DELETED"
            ? 200
            : 1500;
    return new Response(null, { headers: { "content-range": `*/${count}` } });
  });
  const stats = await getDashboardStats(client, { organizationId: "org-a" });
  assert.equal(stats.totalStudents, 1500);
  assert.equal(stats.activeStudents, 1200);
  assert.equal(stats.graduatedStudents, 100);
  assert.equal(stats.deletedStudents, 200);
});

test("hours aggregate receives the organization and returns totals without fetching history", async () => {
  let calls = 0;
  const client = mockClient(async (input, init) => {
    calls += 1;
    assert.match(String(input), /\/rpc\/get_student_total_hours$/);
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
    assert.equal(url.searchParams.get("order"), "schedule_id.asc");
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

test("organization summaries use one request for embedded counts and optional notification settings", async () => {
  let calls = 0;
  const client = mockClient(async (input) => {
    calls += 1;
    const query = new URL(String(input));
    assert.equal(
      query.searchParams.get("settings.setting_key"),
      "eq.notifications_enabled",
    );
    assert.match(
      query.searchParams.get("select") ?? "",
      /organization_members\(count\)/,
    );
    assert.match(query.searchParams.get("select") ?? "", /schedules\(count\)/);
    return new Response(
      JSON.stringify([
        {
          organization_id: "org-a",
          name: "Class A",
          members: [{ count: 1500 }],
          lessons: [{ count: 8000 }],
          settings: [{ setting_value: { value: true } }],
        },
        {
          organization_id: "org-b",
          name: "Class B",
          members: [{ count: 0 }],
          lessons: [{ count: 0 }],
          settings: [],
        },
      ]),
      { headers: { "content-type": "application/json" } },
    );
  });
  const organizations = await getOrganizationsWithStats(client);
  assert.deepEqual(organizations, [
    {
      organization_id: "org-a",
      name: "Class A",
      memberCount: 1500,
      scheduleCount: 8000,
      notificationsEnabled: true,
    },
    {
      organization_id: "org-b",
      name: "Class B",
      memberCount: 0,
      scheduleCount: 0,
      notificationsEnabled: false,
    },
  ]);
  assert.equal(calls, 1);
});

test("public and admin program loaders select the original instructor relationship explicitly", async () => {
  let calls = 0;
  const client = mockClient(async (input, init) => {
    calls += 1;
    const select = new URL(String(input)).searchParams.get("select") ?? "";
    if (
      !select.includes(
        "instructor:instructors!programs_instructor_id_instructors_instructor_id_fk(*)",
      )
    ) {
      return new Response(
        '{"code":"PGRST201","message":"Multiple relationships found"}',
        { status: 300, headers: { "content-type": "application/json" } },
      );
    }
    const program = {
      program_id: 1,
      title: "Class A",
      instructor: { instructor_id: 2, name: "Teacher" },
    };
    const single = new Headers(init?.headers)
      .get("accept")
      ?.includes("vnd.pgrst.object");
    return new Response(JSON.stringify(single ? program : [program]), {
      headers: { "content-type": "application/json" },
    });
  });
  const programs = await getPrograms(client, { organizationId: "org-a" });
  const program = await getProgram(client, { programId: 1 });
  const publicProgram = await getPublicProgramBySlug(client, {
    slug: "class-a",
  });
  assert.equal(programs[0]?.instructor?.name, "Teacher");
  assert.equal(program?.instructor?.name, "Teacher");
  assert.equal(publicProgram.instructor?.name, "Teacher");
  assert.equal(calls, 3);
});

test("every calendar schedule program embedding remains unambiguous after tenant FKs are added", async () => {
  const source = await readFile(
    new URL("../app/features/schedules/queries.ts", import.meta.url),
    "utf8",
  );
  const embeds = source.match(/program:programs[^\s(]*\(/g) ?? [];
  assert.equal(embeds.length, 5);
  assert.ok(
    embeds.every(
      (embed) =>
        embed ===
        "program:programs!schedules_program_id_programs_program_id_fk(",
    ),
  );
  const migration = await readFile(
    new URL("../sql/migrations/0004_cool_leopardon.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    migration,
    /ADD CONSTRAINT "schedules_program_id_programs_program_id_fk" FOREIGN KEY \("program_id"\)/,
  );
});
