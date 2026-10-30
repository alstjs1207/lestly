import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BOOKING_POLICY } from "../app/features/app-settings/booking-policy.ts";
import {
  programBookingDefaults,
  programBookingSchema,
  resolveProgramBookingPolicy,
} from "../app/features/programs/booking-policy.ts";
import { desktopBookingSlots } from "../app/features/schedules/utils/desktop-booking.ts";
import { validateScheduleCandidatesAgainstExisting } from "../app/features/schedules/utils/schedule-validation.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

test("class creation defaults copy lengths without sharing mutable state; existing class rules survive changed organization defaults", () => {
  const org = {
    ...DEFAULT_BOOKING_POLICY,
    durationMinutes: [40, 50],
    defaultDurationMinutes: 50,
  };
  const p = programBookingDefaults(org, 7);
  org.durationMinutes.push(90);
  assert.deepEqual(p.booking_duration_minutes, [40, 50]);
  const resolved = resolveProgramBookingPolicy(
    { ...org, durationMinutes: [90], defaultDurationMinutes: 90 },
    p,
  );
  assert.deepEqual(resolved.durationMinutes, [40, 50]);
  assert.equal(resolved.defaultDurationMinutes, 50);
  assert.deepEqual(resolved.cancellationPolicy, org.cancellationPolicy);
  assert.deepEqual(resolved.bookingWindow, org.bookingWindow);
  assert.equal(resolved.firstStart, org.firstStart);
  for (const bad of [
    { ...p, max_capacity: 0 },
    { ...p, duration_minutes: 90 },
    { ...p, booking_duration_minutes: [50, 50] },
  ])
    assert.equal(programBookingSchema.safeParse(bad).success, false);
});
test("batch validation isolates class seats while preventing a student's cross-class overlap", () => {
  const startTime = new Date("2099-01-01T01:00:00Z"),
    endTime = new Date("2099-01-01T02:00:00Z");
  const candidate = { studentId: "A", startTime, endTime };
  const existing = {
    studentId: "B",
    programId: 2,
    scheduleId: 1,
    startTime,
    endTime,
  };
  assert.equal(
    validateScheduleCandidatesAgainstExisting([candidate], [existing], 1, 1)
      .allowed,
    true,
  );
  assert.equal(
    validateScheduleCandidatesAgainstExisting(
      [candidate],
      [{ ...existing, programId: 1 }],
      1,
      1,
    ).reason,
    "capacity",
  );
  assert.equal(
    validateScheduleCandidatesAgainstExisting(
      [candidate],
      [{ ...existing, studentId: "A" }],
      1,
      1,
    ).reason,
    "student_conflict",
  );
});
test("availability results for another class cannot close this class or change its duration policy", () => {
  const course = {
    classStartDate: null,
    classEndDate: null,
    programId: 2,
    bookingPolicy: DEFAULT_BOOKING_POLICY,
  };
  const slots = desktopBookingSlots(
    "2099-01-01",
    3,
    course,
    [],
    new Date("2098-12-31T00:00:00Z"),
    {
      key: "1:2099-01-01:3",
      slots: [
        {
          start_time: "2099-01-01T09:00:00+09:00",
          available: false,
          reason: "capacity",
        },
      ],
      bookingPolicy: { ...DEFAULT_BOOKING_POLICY, firstStart: "10:00" },
    },
  );
  assert.equal(slots[0].time, "09:00");
  assert.equal(slots[0].reason, null);
});
test("server resolver requires a positive class ID and selects only active classes in the requested tenant", async () => {
  const calls: any[] = [];
  let data: any = {
    program_id: 1,
    duration_minutes: 50,
    booking_duration_minutes: [40, 50],
    max_capacity: 2,
  };
  const chain: any = {
    select: (s: string) => {
      calls.push(["select", s]);
      return chain;
    },
    eq: (...v: any[]) => {
      calls.push(v);
      return chain;
    },
    maybeSingle: async () => ({ data, error: null }),
  };
  const { getProgramBookingPolicy } = loadMockedModule<any>(
    new URL(
      "../app/features/programs/booking-policy.server.ts",
      import.meta.url,
    ),
    {
      "../app-settings/booking-policy.server": {
        getBookingPolicy: async () => DEFAULT_BOOKING_POLICY,
      },
      "./booking-policy": { resolveProgramBookingPolicy },
    },
  );
  const client = {
    from: (name: string) => {
      assert.equal(name, "programs");
      return chain;
    },
  };
  for (const programId of [0, -1, NaN, 1.5])
    await assert.rejects(
      () => getProgramBookingPolicy(client, { organizationId: "A", programId }),
      /schedule_program_required/,
    );
  const result = await getProgramBookingPolicy(client, {
    organizationId: "A",
    programId: 1,
  });
  assert.equal(result.capacity, 2);
  assert.equal(result.policy.defaultDurationMinutes, 50);
  assert.ok(calls.some((v) => v[0] === "organization_id" && v[1] === "A"));
  assert.ok(calls.some((v) => v[0] === "status" && v[1] === "ACTIVE"));
  data = null;
  await assert.rejects(
    () =>
      getProgramBookingPolicy(client, { organizationId: "A", programId: 1 }),
    /schedule_program_not_eligible/,
  );
});
