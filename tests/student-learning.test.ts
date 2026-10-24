import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  completedSchedules,
  coursePeriodSummary,
  learningHeatmap,
  scheduleTimeRange,
  sumScheduleHours,
} from "../app/features/schedules/utils/learning-records.ts";
import {
  bookingDateReason,
  bookingSlotReason,
} from "../app/features/schedules/utils/student-booking.ts";
import {
  getStudentLearningHome,
  getStudentLearningRecords,
} from "../app/features/schedules/utils/student-learning.server.ts";
import {
  parseReflections,
  reflectionStorageKey,
} from "../app/features/users/utils/reflections.ts";

const now = new Date("2026-10-23T03:00:00Z"); // Noon in Korea
const row = (id: number, start: string, end: string) => ({
  schedule_id: id,
  start_time: start,
  end_time: end,
  program: null,
});
const ended = row(1, "2026-10-12T01:00:00Z", "2026-10-12T04:00:00Z");
const running = row(2, "2026-10-23T01:00:00Z", "2026-10-23T04:00:00Z");
const nextMonth = row(3, "2026-11-01T04:00:00Z", "2026-11-01T07:00:00Z");
const client = (fetch: typeof globalThis.fetch) =>
  createClient("https://example.supabase.co", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }) as never;

test("only ended schedules count, including the exact end boundary", () => {
  assert.equal(
    sumScheduleHours(completedSchedules([ended, running, nextMonth], now)),
    3,
  );
  assert.equal(
    completedSchedules([running], new Date(running.end_time)).length,
    1,
  );
  assert.equal(sumScheduleHours([row(4, "bad", "bad")]), 0);
});

test("heatmap uses 12 Monday-first KST weeks and combines only ended hours", () => {
  const days = learningHeatmap(
    [ended, running, row(4, "2026-10-11T15:00:00Z", "2026-10-11T18:00:00Z")],
    now,
  );
  assert.equal(days.length, 84);
  assert.equal(days[0].date, "2026-08-03");
  assert.equal(days.find((d) => d.date === "2026-10-12")?.hours, 6);
  assert.equal(days.find((d) => d.date === "2026-10-23")?.hours, 0);
  assert.equal(days.at(-1)?.date, "2026-10-25");
  assert.equal(days.at(-1)?.future, true);
  assert.equal(
    learningHeatmap([], new Date("2026-12-31T15:00:00Z")).find(
      (d) => d.date === "2027-01-01",
    )?.future,
    false,
  );
});

test("same-day booking allows future slots but excludes past, conflicts and course dates", () => {
  const course = { classStartDate: "2026-10-01", classEndDate: "2026-11-30" };
  assert.equal(bookingDateReason("2026-10-23", course, now), null);
  assert.match(
    bookingSlotReason("2026-10-23", "12:00", 3, course, [], now)!,
    /지난/,
  );
  assert.equal(
    bookingSlotReason("2026-10-23", "13:00", 3, course, [running], now),
    null,
  );
  assert.match(
    bookingSlotReason("2026-10-23", "12:30", 3, course, [running], now)!,
    /겹/,
  );
  assert.match(bookingDateReason("2026-10-22", course, now)!, /지난/);
  assert.match(bookingDateReason("2026-11-01", course, now)!, /25일/);
  assert.equal(
    bookingDateReason("2026-11-01", course, new Date("2026-10-24T15:00:00Z")),
    null,
  );
  assert.match(bookingDateReason("2026-12-01", course, now)!, /수강 기간/);
  assert.equal(
    bookingDateReason(
      "2027-01-01",
      { classStartDate: null, classEndDate: null },
      new Date("2026-12-25T03:00:00Z"),
    ),
    null,
  );
});

test("course expiry and overnight end dates remain explicit", () => {
  assert.equal(coursePeriodSummary(null, "2026-10-22", now)?.status, "expired");
  assert.equal(
    coursePeriodSummary(null, "2026-10-23", now)?.status,
    "last-day",
  );
  assert.deepEqual(coursePeriodSummary(null, "2026-10-24", now), {
    status: "ending",
    days: 1,
  });
  assert.match(
    scheduleTimeRange(row(1, "2026-10-23T11:00:00Z", "2026-10-23T20:00:00Z")),
    /20:00 — 10월 24일.*05:00/,
  );
});

test("course period uses Korean calendar days and handles upcoming and missing dates", () => {
  assert.deepEqual(
    coursePeriodSummary(
      "2026-02-01",
      "2027-02-01",
      new Date("2026-10-24T03:00:00Z"),
    ),
    { status: "active", days: 100 },
  );
  assert.deepEqual(coursePeriodSummary("2026-10-25", "2027-02-01", now), {
    status: "upcoming",
    days: 2,
  });
  assert.deepEqual(coursePeriodSummary("2026-02-01", null, now), {
    status: "active",
    days: null,
  });
  assert.equal(coursePeriodSummary(null, null, now), null);
  assert.equal(coursePeriodSummary(null, "2026-11-22", now)?.status, "ending");
  assert.equal(coursePeriodSummary(null, "2026-11-23", now)?.status, "active");
  assert.deepEqual(
    coursePeriodSummary(null, "2026-10-24", new Date("2026-10-23T15:00:00Z")),
    { status: "last-day", days: 0 },
  );
});

test("home next class query has no month cutoff and separates in-progress hours", async () => {
  const urls: URL[] = [];
  const result = await getStudentLearningHome(
    client(async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.includes("/rpc/"))
        return Response.json([{ student_id: "student-a", total_hours: 42 }]);
      assert.equal(url.searchParams.get("student_id"), "eq.student-a");
      if (url.searchParams.get("limit") === "1") {
        assert.equal(
          url.searchParams.get("end_time"),
          `gt.${now.toISOString()}`,
        );
        assert.equal(url.searchParams.get("start_time"), null);
        return Response.json([nextMonth]);
      }
      return Response.json([ended, running]);
    }),
    "student-a",
    now,
  );
  assert.equal(result.nextSchedule?.schedule_id, 3);
  assert.equal(result.totalHours, 42);
  assert.equal(result.thisMonthHours, 3);
  assert.equal(result.thisMonthCount, 1);
  assert.equal(urls.length, 3);
});

test("record month, heatmap and totals have independent query ranges", async () => {
  const urls: URL[] = [];
  const result = await getStudentLearningRecords(
    client(async (input) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.includes("/rpc/"))
        return Response.json([{ student_id: "student-a", total_hours: 42 }]);
      assert.equal(url.searchParams.get("student_id"), "eq.student-a");
      assert.equal(
        url.searchParams.get("end_time"),
        `lte.${now.toISOString()}`,
      );
      assert.match(
        url.searchParams.get("select")!,
        /instructor:instructors!programs_instructor_id_instructors_instructor_id_fk/,
      );
      return Response.json([ended]);
    }),
    "student-a",
    {
      startDate: new Date("2026-09-30T15:00:00Z"),
      endDate: new Date("2026-10-31T15:00:00Z"),
    },
    now,
  );
  assert.equal(result.periodHours, 3);
  assert.equal(result.totalHours, 42);
  const scheduleUrls = urls.filter((u) => u.pathname.endsWith("schedules"));
  assert.deepEqual(scheduleUrls[0].searchParams.getAll("start_time"), [
    "gte.2026-09-30T15:00:00.000Z",
    "lt.2026-10-31T15:00:00.000Z",
  ]);
  assert.deepEqual(scheduleUrls[1].searchParams.getAll("start_time"), [
    "gte.2026-08-02T15:00:00.000Z",
  ]);
});

test("reflection keys isolate profiles and malformed history cannot become a saved entry", () => {
  assert.notEqual(reflectionStorageKey("a"), reflectionStorageKey("b"));
  assert.deepEqual(parseReflections("broken"), {});
  assert.deepEqual(
    parseReflections(
      JSON.stringify({
        "2026-10-23": { text: "작은 진전", updatedAt: now.toISOString() },
        bad: { text: "no" },
      }),
    ),
    { "2026-10-23": { text: "작은 진전", updatedAt: now.toISOString() } },
  );
});
