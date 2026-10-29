import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarMonthDays,
  desktopBookingSlots,
} from "../app/features/schedules/utils/desktop-booking.ts";
import { calendarDateString } from "../app/features/schedules/utils/student-booking.ts";

const now = new Date("2026-10-23T06:00:00Z");
const course = { classStartDate: "2026-08-01", classEndDate: "2026-11-30" };
const availability = (key: string, time: string, reason: string) => ({
  key,
  slots: [
    { start_time: `2026-10-24T${time}:00+09:00`, available: false, reason },
  ],
});

test("monthly calendar spans six full Sunday-first weeks across year and leap-day boundaries", () => {
  const december = calendarMonthDays(2026, 12).map(calendarDateString);
  assert.equal(december.length, 42);
  assert.equal(december[0], "2026-11-29");
  assert.equal(december.at(-1), "2027-01-09");
  assert.equal(new Set(december).size, 42);
  const leap = calendarMonthDays(2028, 2).map(calendarDateString);
  assert.ok(leap.includes("2028-02-29"));
  assert.ok(leap.includes("2028-03-01"));
});

test("all 23 start times remain visible with accurate local and capacity reasons", () => {
  const past = desktopBookingSlots("2026-10-23", 3, course, [], now, undefined);
  assert.equal(past.length, 23);
  assert.equal(past[0].time, "09:00");
  assert.equal(past.at(-1)?.time, "20:00");
  assert.equal(past.find((s) => s.time === "15:00")?.label, "지난 시간");
  assert.equal(past.find((s) => s.time === "15:30")?.reason, null);
  const full = desktopBookingSlots(
    "2026-10-24",
    3,
    course,
    [],
    now,
    availability("2026-10-24:3", "09:00", "capacity"),
  );
  assert.equal(full[0].label, "정원 마감");
  assert.equal(full[1].label, "확인 불가");
});

test("duration-specific overlap includes classes that cross midnight and permits adjacent endpoints", () => {
  const schedules = [
    {
      start_time: "2026-10-24T01:00:00+09:00",
      end_time: "2026-10-24T04:00:00+09:00",
    },
  ];
  const three = desktopBookingSlots(
    "2026-10-23",
    3,
    course,
    schedules,
    now,
    undefined,
  );
  const nine = desktopBookingSlots(
    "2026-10-23",
    9,
    course,
    schedules,
    now,
    undefined,
  );
  assert.equal(three.at(-1)?.reason, null); // 20:00–23:00
  assert.equal(nine.find((s) => s.time === "16:00")?.reason, null); // ends 01:00
  assert.equal(nine.at(-1)?.label, "내 수업"); // 20:00–05:00
});

test("a response for another date or duration cannot disable the new selection", () => {
  const old = availability("2026-10-24:3", "09:00", "capacity");
  assert.equal(
    desktopBookingSlots("2026-10-25", 3, course, [], now, old)[0].reason,
    null,
  );
  assert.equal(
    desktopBookingSlots("2026-10-24", 6, course, [], now, old)[0].reason,
    null,
  );
});

test("rolling-deployment capacity fallback preserves local conflicts and date restrictions", () => {
  const schedules = [
    {
      start_time: "2026-10-24T13:00:00+09:00",
      end_time: "2026-10-24T16:00:00+09:00",
    },
  ];
  const result = desktopBookingSlots("2026-10-24", 3, course, schedules, now, {
    key: "2026-10-24:3",
    slots: null,
  });
  assert.equal(result.find((s) => s.time === "13:00")?.label, "내 수업");
  assert.match(result.find((s) => s.time === "16:00")?.reason ?? "", /불러오지 못/);
  assert.ok(
    desktopBookingSlots("2026-11-01", 3, course, [], now, undefined).every(
      (s) => s.reason?.includes("25일"),
    ),
  );
  assert.ok(
    desktopBookingSlots("2026-12-01", 3, course, [], now, undefined).every(
      (s) => s.reason?.includes("수강 기간"),
    ),
  );
});
