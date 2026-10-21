import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentScheduleStreak } from "../app/features/schedules/utils/student-streak.ts";

const today = new Date("2026-10-02T16:00:00.000Z"); // October 3 in KST

test("learning streak counts distinct KST days across a UTC day boundary", async () => {
  const result = await getCurrentScheduleStreak(
    async () => ({
      data: [
        { start_time: "2026-10-02T16:00:00.000Z" },
        { start_time: "2026-10-02T15:30:00.000Z" },
        { start_time: "2026-10-02T01:00:00.000Z" },
        { start_time: "2026-10-01T01:00:00.000Z" },
        { start_time: "2026-09-29T01:00:00.000Z" },
      ],
      error: null,
    }),
    today,
  );
  assert.equal(result, 3);
});

test("streak stops at the first missing day without requesting older history", async () => {
  let calls = 0;
  const result = await getCurrentScheduleStreak(async () => {
    calls += 1;
    return {
      data: Array.from({ length: 500 }, (_, i) => ({
        start_time: i === 0 ? "2026-10-02T16:00:00Z" : "2026-09-30T01:00:00Z",
      })),
      error: null,
    };
  }, today);
  assert.equal(result, 1);
  assert.equal(calls, 1);
});

test("duplicates spanning a page boundary do not truncate the streak", async () => {
  const rows = [
    ...Array.from({ length: 1001 }, () => ({
      start_time: "2026-10-02T16:00:00Z",
    })),
    { start_time: "2026-10-02T01:00:00Z" },
    { start_time: "2026-10-01T01:00:00Z" },
  ];
  let calls = 0;
  const result = await getCurrentScheduleStreak(async (from, to) => {
    calls += 1;
    return { data: rows.slice(from, to + 1), error: null };
  }, today);
  assert.equal(result, 3);
  assert.equal(calls, 3);
});

test("no schedule today resets the existing learning streak to zero", async () => {
  assert.equal(
    await getCurrentScheduleStreak(
      async () => ({
        data: [{ start_time: "2026-10-02T01:00:00Z" }],
        error: null,
      }),
      today,
    ),
    0,
  );
});
