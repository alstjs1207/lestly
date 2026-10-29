import assert from "node:assert/strict";
import test from "node:test";

import { getBookingPolicy } from "../app/features/app-settings/booking-policy.server.ts";
import {
  DEFAULT_BOOKING_POLICY,
  bookingDurationOptions,
  bookingPolicySchema,
  bookingStartTimes,
  calendarTimeBounds,
  submittedDuration,
} from "../app/features/app-settings/booking-policy.ts";
import { desktopBookingSlots } from "../app/features/schedules/utils/desktop-booking.ts";
import {
  peakConcurrentCount,
  validateScheduleCandidatesAgainstExisting,
} from "../app/features/schedules/utils/schedule-validation.ts";
import { bookingSlotReason } from "../app/features/schedules/utils/student-booking.ts";

const policy = {
  ...DEFAULT_BOOKING_POLICY,
  durationMinutes: [40, 50, 90],
  defaultDurationMinutes: 40,
  startIntervalMinutes: 50,
};
test("minute schedules advance from the first start without resetting at each hour", () => {
  assert.deepEqual(bookingStartTimes(policy).slice(0, 5), [
    "09:00",
    "09:50",
    "10:40",
    "11:30",
    "12:20",
  ]);
  assert.deepEqual(
    bookingStartTimes({ ...policy, firstStart: "09:10", lastStart: "11:00" }),
    ["09:10", "10:00", "10:50"],
  );
  assert.deepEqual(
    bookingStartTimes({
      ...policy,
      firstStart: "23:30",
      lastStart: "23:59",
      startIntervalMinutes: 60,
    }),
    ["23:30"],
  );
  assert.equal(bookingStartTimes().length, 23);
  assert.deepEqual(
    bookingDurationOptions().map((d) => d.hours),
    [3, 6, 9],
  );
});
test("invalid policy combinations cannot create empty loops, unknown defaults or ambiguous lengths", () => {
  for (const patch of [
    { durationMinutes: [] },
    { durationMinutes: [40, 40] },
    { defaultDurationMinutes: 60 },
    { startIntervalMinutes: 0 },
    { startIntervalMinutes: 1.5 },
    { firstStart: "24:00" },
    { firstStart: "21:00", lastStart: "09:00" },
    { leadMinutes: -1 },
    { leadMinutes: 43201 },
    { durationMinutes: [1441] },
  ])
    assert.equal(
      bookingPolicySchema.safeParse({ ...policy, ...patch }).success,
      false,
    );
  assert.equal(bookingPolicySchema.safeParse(policy).success, true);
});
test("explicit minutes and legacy times are validated without silently coercing an old duration", () => {
  const form = new FormData();
  form.set("duration_minutes", "40");
  assert.equal(submittedDuration(form, policy), 40);
  form.set("duration_minutes", "180");
  assert.throws(() => submittedDuration(form, policy));
  assert.equal(submittedDuration(form, policy, 180), 180);
  form.delete("duration_minutes");
  form.set("duration", "3");
  assert.equal(submittedDuration(form, DEFAULT_BOOKING_POLICY), 540);
  form.set("duration", "oops");
  assert.throws(() => submittedDuration(form, policy));
});
test("only absent policy uses legacy defaults; read errors and malformed saved policies fail closed", async () => {
  let response: any = { data: null, error: null };
  const q: any = {
    select: () => q,
    eq: () => q,
    in: async () => response,
  };
  const client: any = { from: () => q };
  assert.deepEqual(
    await getBookingPolicy(client, { organizationId: "org-a" }),
    DEFAULT_BOOKING_POLICY,
  );
  response = { data: null, error: new Error("read_failed") };
  await assert.rejects(
    getBookingPolicy(client, { organizationId: "org-a" }),
    /read_failed/,
  );
  response = {
    data: [
      {
        setting_key: "booking_policy",
        setting_value: { ...policy, startIntervalMinutes: 0 },
      },
    ],
    error: null,
  };
  await assert.rejects(getBookingPolicy(client, { organizationId: "org-a" }));
});
test("lead time accepts its exact boundary and rejects the millisecond before it", () => {
  const course = {
    classStartDate: null,
    classEndDate: null,
    bookingPolicy: { ...policy, leadMinutes: 60 },
  };
  const now = new Date("2026-10-24T08:00:00+09:00");
  assert.equal(
    bookingSlotReason("2026-10-24", "09:00", 40 / 60, course, [], now),
    null,
  );
  assert.match(
    bookingSlotReason(
      "2026-10-24",
      "09:00",
      40 / 60,
      course,
      [],
      new Date(+now + 1),
    )!,
    /마감/,
  );
  assert.match(
    bookingSlotReason("2026-10-24", "09:30", 40 / 60, course, [], now)!,
    /시작 시간/,
  );
  const slots = desktopBookingSlots("2026-10-24", 40 / 60, course, [], now, {
    key: `2026-10-24:${40 / 60}`,
    slots: null,
  });
  assert.ok(slots.every((s) => s.reason));
});
test("capacity measures the maximum simultaneous occupancy rather than all intersecting rows", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 24, h));
  const rows = [
    { scheduleId: 1, studentId: "a", startTime: at(9), endTime: at(10) },
    { scheduleId: 2, studentId: "b", startTime: at(10), endTime: at(11) },
  ];
  const candidate = { studentId: "c", startTime: at(9), endTime: at(11) };
  assert.equal(peakConcurrentCount(candidate, rows), 1);
  assert.equal(
    validateScheduleCandidatesAgainstExisting([candidate], rows, 2).allowed,
    true,
  );
  assert.equal(
    validateScheduleCandidatesAgainstExisting(
      [candidate, { ...candidate, studentId: "d" }],
      rows,
      2,
    ).reason,
    "capacity",
  );
  assert.equal(
    validateScheduleCandidatesAgainstExisting(
      [{ ...candidate, studentId: "a" }],
      rows,
      5,
    ).reason,
    "student_conflict",
  );
});
test("calendar bounds keep legacy out-of-range and overnight lessons visible", () => {
  const bounds = calendarTimeBounds(policy, [
    { start: "2026-10-24T23:30:00+09:00", end: "2026-10-25T01:00:00+09:00" },
  ]);
  assert.equal(bounds.slotMinTime, "00:00");
  assert.equal(bounds.slotMaxTime, "24:00");
  assert.deepEqual(bounds.slotDuration, { minutes: 50 });
});

test("resolved policy reads the separate booking window while preserving legacy clock JSON and rejecting corrupt window data", async () => {
  const { bookingWindow: ignored, ...legacy } = DEFAULT_BOOKING_POLICY;
  let rows: any[] = [
    { setting_key: "booking_policy", setting_value: legacy },
    {
      setting_key: "booking_window",
      setting_value: { mode: "rolling", daysAhead: 14 },
    },
  ];
  const query: any = {
    select: () => query,
    eq: (key: string, value: string) => {
      assert.equal(key, "organization_id");
      assert.equal(value, "org-a");
      return query;
    },
    in: async (_: string, keys: string[]) => {
      assert.deepEqual(keys, ["booking_policy", "booking_window"]);
      return { data: rows, error: null };
    },
  };
  const resolved = await getBookingPolicy({ from: () => query } as any, {
    organizationId: "org-a",
  });
  assert.deepEqual(resolved.bookingWindow, { mode: "rolling", daysAhead: 14 });
  assert.deepEqual(rows[0].setting_value, legacy);
  rows[1].setting_value = null;
  await assert.rejects(
    getBookingPolicy({ from: () => query } as any, { organizationId: "org-a" }),
  );
});
