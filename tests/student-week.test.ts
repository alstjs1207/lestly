import assert from "node:assert/strict";
import test from "node:test";

import {
  isStudentScheduleDate,
  parseStudentScheduleDate,
  shiftStudentDate,
  studentWeekDates,
} from "../app/features/schedules/utils/student-week.ts";

const now = new Date("2026-10-25T15:00:00Z"); // Monday midnight in Korea

test("the default week starts on Monday in Korea, including Sundays and month boundaries", () => {
  const today = parseStudentScheduleDate(new URLSearchParams(), now);
  assert.equal(today, "2026-10-26");
  const week = studentWeekDates(today);
  assert.deepEqual(week, [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.deepEqual(studentWeekDates("2026-11-01"), week);
  assert.equal(studentWeekDates("2026-11-02")[0], "2026-11-02");
});

test("week navigation preserves the weekday across years, leap days and daylight saving", () => {
  assert.equal(shiftStudentDate("2026-12-28", 7), "2027-01-04");
  assert.equal(shiftStudentDate("2028-02-29", 7), "2028-03-07");
  assert.equal(shiftStudentDate("2026-03-08", -7), "2026-03-01");
  assert.deepEqual(studentWeekDates("2027-01-01"), [
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
    "2027-01-03",
  ]);
});

test("date links take precedence and old month links and the home booking shortcut still work", () => {
  const parse = (query: string) =>
    parseStudentScheduleDate(new URLSearchParams(query), now);
  assert.equal(parse("date=2026-11-01&year=2026&month=10"), "2026-11-01");
  assert.equal(parse("year=2026&month=10"), "2026-10-26");
  assert.equal(parse("year=2027&month=1"), "2027-01-01");
  assert.equal(parse("year=2027&month=1&book=1"), "2026-10-26");
});

test("invalid date links cannot silently roll into another month or bypass calendar limits", () => {
  for (const value of [
    "",
    "2026-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-1-01",
    "1899-12-31",
    "2101-01-01",
    "invalid",
  ]) {
    assert.equal(isStudentScheduleDate(value), false, value);
    assert.throws(
      () => parseStudentScheduleDate(new URLSearchParams({ date: value }), now),
      (error: unknown) => error instanceof Response && error.status === 400,
    );
  }
  assert.ok(isStudentScheduleDate("2028-02-29"));
  assert.ok(isStudentScheduleDate("1900-01-01"));
  assert.ok(isStudentScheduleDate("2100-12-31"));
});

test("same-month date changes reuse schedules, while month boundaries and mutations revalidate", async () => {
  const { revalidateStudentCalendar } = await import(
    "../app/features/schedules/utils/student-week.ts"
  );
  const currentUrl = new URL(
    "https://lestly.test/my-schedules?date=2026-10-26",
  );
  const check = (next: string, formMethod?: string) =>
    revalidateStudentCalendar({
      currentUrl,
      nextUrl: new URL(next, currentUrl),
      formMethod,
      defaultShouldRevalidate: true,
    });
  assert.equal(check("?date=2026-10-27"), false);
  assert.equal(check("?date=2026-10-31"), false);
  assert.equal(check("?date=2026-11-01"), true);
  assert.equal(check("?date=2026-10-27&schedule=5"), true);
  assert.equal(check("?date=2026-10-27", "POST"), true);
  assert.equal(check("?date=2026-10-26"), true); // explicit revalidation
  assert.equal(check("?date=invalid"), true);
});
