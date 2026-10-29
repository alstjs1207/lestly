import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_BOOKING_POLICY,
  parseBookingPolicy,
} from "../app/features/app-settings/booking-policy.ts";
import {
  bookingWindowDescription,
  bookingWindowFromForm,
  bookingWindowRange,
  bookingWindowSchema,
  isBookingDateInWindow,
} from "../app/features/app-settings/booking-window.ts";
import { desktopBookingSlots } from "../app/features/schedules/utils/desktop-booking.ts";
import { toKSTDateString } from "../app/features/schedules/utils/kst.ts";
import {
  bookingDateReason,
  bookingSlotReason,
} from "../app/features/schedules/utils/student-booking.ts";
import {
  canStudentRegisterSchedule,
  getStudentAllowedDateRange,
} from "../app/features/schedules/utils/student-schedule-rules.ts";

test("monthly opening switches at Korean midnight, including last-day fallback, leap years and year rollover", () => {
  for (const [now, day, end] of [
    ["2026-10-24T14:59:59.999Z", 25, "2026-11-01"],
    ["2026-10-24T15:00:00.000Z", 25, "2026-12-01"],
    ["2026-10-01T00:00:00+09:00", 1, "2026-12-01"],
    ["2026-02-27T23:59:59.999+09:00", 31, "2026-03-01"],
    ["2026-02-28T00:00:00+09:00", 31, "2026-04-01"],
    ["2024-02-28T23:59:59.999+09:00", 30, "2024-03-01"],
    ["2024-02-29T00:00:00+09:00", 30, "2024-04-01"],
    ["2026-04-30T00:00:00+09:00", 31, "2026-06-01"],
    ["2026-12-25T00:00:00+09:00", 25, "2027-02-01"],
  ] as const) {
    const range = bookingWindowRange(
      { mode: "monthly", openingDay: day },
      new Date(now),
    );
    assert.equal(toKSTDateString(range.endExclusive), end, now);
    assert.equal(+range.endDate + 1, +range.endExclusive);
    assert.equal(
      toKSTDateString(range.startDate),
      toKSTDateString(new Date(now)),
    );
  }
});

test("rolling window includes the Nth day, supports today-only and advances at Korean midnight", () => {
  const w = { mode: "rolling", daysAhead: 14 } as const;
  const now = new Date("2026-10-29T23:59:59.999+09:00");
  assert.equal(isBookingDateInWindow("2026-11-12", w, now), true);
  assert.equal(isBookingDateInWindow("2026-11-13", w, now), false);
  assert.equal(
    isBookingDateInWindow("2026-11-13", w, new Date(+now + 1)),
    true,
  );
  assert.equal(
    isBookingDateInWindow("2026-10-29", w, new Date(+now + 1)),
    false,
  );
  assert.equal(
    toKSTDateString(
      bookingWindowRange({ mode: "rolling", daysAhead: 0 }, now).endDate,
    ),
    "2026-10-29",
  );
  assert.equal(
    toKSTDateString(
      bookingWindowRange(
        { mode: "rolling", daysAhead: 365 },
        new Date("2026-12-31T12:00:00+09:00"),
      ).endDate,
    ),
    "2027-12-31",
  );
});

test("the modes are exclusive and malformed, mixed or unbounded settings fail validation", () => {
  for (const window of [
    null,
    {},
    { mode: "other" },
    { mode: "monthly", openingDay: 0 },
    { mode: "monthly", openingDay: 32 },
    { mode: "monthly", openingDay: 1.5 },
    { mode: "monthly", openingDay: "25" },
    { mode: "monthly", openingDay: 25, daysAhead: 14 },
    { mode: "rolling", daysAhead: -1 },
    { mode: "rolling", daysAhead: 366 },
    { mode: "rolling", daysAhead: 1.5 },
    { mode: "rolling", daysAhead: 14, openingDay: 25 },
  ])
    assert.equal(bookingWindowSchema.safeParse(window).success, false);
  const { bookingWindow: omitted, ...legacy } = DEFAULT_BOOKING_POLICY;
  assert.deepEqual(parseBookingPolicy(legacy).bookingWindow, {
    mode: "monthly",
    openingDay: 25,
  });
  assert.throws(() => parseBookingPolicy({ ...legacy, bookingWindow: null }));
  assert.match(
    bookingWindowDescription({ mode: "rolling", daysAhead: 0 }),
    /오늘 수업만/,
  );
});

test("forms use only the selected mode and reject missing, fractional and empty values", () => {
  const form = new FormData();
  form.set("bookingWindowMode", "monthly");
  form.set("bookingOpeningDay", "31");
  form.set("bookingDaysAhead", "invalid");
  assert.deepEqual(bookingWindowFromForm(form), {
    mode: "monthly",
    openingDay: 31,
  });
  form.set("bookingWindowMode", "rolling");
  form.set("bookingDaysAhead", "0");
  form.set("bookingOpeningDay", "invalid");
  assert.deepEqual(bookingWindowFromForm(form), {
    mode: "rolling",
    daysAhead: 0,
  });
  for (const raw of ["", "1.5", "1e2", "-1", "366"]) {
    form.set("bookingDaysAhead", raw);
    assert.throws(() => bookingWindowFromForm(form));
  }
});

test("API date rules, slot checks, course limits and latest availability policy use the same booking window", () => {
  const now = new Date("2026-10-29T08:00:00+09:00");
  const policy = {
    ...DEFAULT_BOOKING_POLICY,
    bookingWindow: { mode: "rolling", daysAhead: 14 } as const,
  };
  const course = {
    classStartDate: null,
    classEndDate: null,
    bookingPolicy: policy,
  };
  assert.equal(bookingDateReason("2026-11-12", course, now), null);
  assert.match(bookingDateReason("2026-11-13", course, now)!, /14일/);
  assert.equal(
    canStudentRegisterSchedule(
      new Date("2026-11-12T00:00:00+09:00"),
      policy,
      now,
    ),
    true,
  );
  assert.equal(
    canStudentRegisterSchedule(
      new Date("2026-11-13T00:00:00+09:00"),
      policy,
      now,
    ),
    false,
  );
  assert.equal(
    toKSTDateString(getStudentAllowedDateRange(policy, now).endDate),
    "2026-11-12",
  );
  assert.match(
    bookingDateReason(
      "2026-11-12",
      { ...course, classEndDate: "2026-11-10" },
      now,
    )!,
    /수강 기간/,
  );
  assert.match(
    bookingSlotReason(
      "2026-10-29",
      "09:00",
      3,
      { ...course, bookingPolicy: { ...policy, leadMinutes: 61 } },
      [],
      now,
    )!,
    /마감/,
  );
  const slots = desktopBookingSlots("2026-11-12", 3, course, [], now, {
    key: "2026-11-12:3",
    bookingPolicy: {
      ...policy,
      bookingWindow: { mode: "rolling", daysAhead: 1 },
    },
    slots: [],
  });
  assert.ok(slots.every((s) => s.reason?.includes("1일")));
});
