import type { BookingWindow } from "../app/features/app-settings/booking-window.ts";

import assert from "node:assert/strict";
import test from "node:test";

import * as bookingPolicy from "../app/features/app-settings/booking-policy.ts";
import {
  getKSTMonthRange,
  parseCalendarMonth,
} from "../app/features/schedules/utils/calendar-month.ts";
import { toKSTDateString as realKstDate } from "../app/features/schedules/utils/kst.ts";
import { toKSTDateString } from "../app/features/schedules/utils/kst.ts";
import { getStudentAllowedDateRange } from "../app/features/schedules/utils/student-schedule-rules.ts";
import { parseDateString } from "../app/features/schedules/utils/student-schedule-rules.ts";
import { parseStudentScheduleDate } from "../app/features/schedules/utils/student-week.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const fixedNow = new Date("2026-12-31T15:00:00Z"); // Jan 1 in Korea, Dec 31 UTC
const schedule = {
  schedule_id: 5,
  start_time: "2027-01-31T01:00:00Z",
  end_time: "2027-01-31T04:00:00Z",
  program: null,
};

function fixture(
  window: BookingWindow = { mode: "monthly", openingDay: 25 },
  memberships = [
    {
      organization_id: "org-a",
      state: "NORMAL",
      organizations: { name: "수업 공간 A" },
    },
  ],
  bookable = false,
) {
  const nextFilters: [string, unknown][] = [];
  let range:
    | { startDate: Date; endDate: Date; organizationId?: string }
    | undefined;
  const upcomingQuery = {
    select: () => upcomingQuery,
    is: (key: string, value: unknown) => {
      nextFilters.push([key, value]);
      return upcomingQuery;
    },
    eq: (key: string, value: unknown) => {
      nextFilters.push([key, value]);
      return upcomingQuery;
    },
    gt: (key: string, value: unknown) => {
      nextFilters.push([key, value]);
      return upcomingQuery;
    },
    order: () => upcomingQuery,
    limit: async (count: number) => {
      assert.equal(count, 1);
      return { data: [schedule], error: null };
    },
  };
  const memberQuery = {
    select: () => memberQuery,
    eq: () => memberQuery,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: memberships,
        error: null,
      }).then(resolve),
  };
  const client = {
    from: (table: string) =>
      table === "organization_members" ? memberQuery : upcomingQuery,
  };
  class FixedDate extends Date {
    constructor(value?: string | number) {
      super(value ?? fixedNow.getTime());
    }
  }
  const { loadStudentCalendar } = loadMockedModule<{
    loadStudentCalendar: (
      request: Request,
      options?: { list: boolean },
    ) => Promise<{
      body: {
        organizationId: string;
        canBook: boolean;
        selectedDate: string;
        year: number;
        month: number;
        nextSchedule: typeof schedule | null;
        disabledBookingDays: number[];
        allowedEndDate: string;
      };
    }>;
  }>(
    new URL(
      "../app/features/schedules/utils/student-calendar.server.ts",
      import.meta.url,
    ),
    {
      "../../app-settings/booking-policy.server": {
        getBookingPolicy: async () => ({
          ...bookingPolicy.DEFAULT_BOOKING_POLICY,
          bookingWindow: window,
        }),
      },
      "../../app-settings/booking-policy": bookingPolicy,
      "react-router": { data: (body: unknown) => ({ body }) },
      "../../../core/lib/supa-client.server": {
        default: () => [client, new Headers()],
        getSessionUser: async () => ({ id: "user-a" }),
      },
      "../../programs/queries": {
        getActivePrograms: async () => (bookable ? [{ program_id: 1 }] : []),
      },
      "../../app-settings/queries": {
        getDisabledBookingDays: async (
          _: unknown,
          { organizationId }: { organizationId: string },
        ) => {
          assert.ok(
            memberships.some((m) => m.organization_id === organizationId),
          );
          return [6, 0];
        },
      },
      "../../users/queries": {
        getUserProfile: async () => ({
          profile_id: "student-a",
          class_start_date: null,
          class_end_date: null,
        }),
      },
      "./calendar-month": { getKSTMonthRange, parseCalendarMonth },
      "./kst": { toKSTDateString },
      "./student-learning.server": {
        learningScheduleSelect: "schedule_id,start_time,end_time",
        getLearningSchedules: async (_: unknown, options: typeof range) => {
          range = options;
          return [schedule];
        },
      },
      "./student-schedule-rules": {
        getStudentAllowedDateRange,
      },
      "./student-week": { parseStudentScheduleDate },
    },
    { Date: FixedDate, URL, URLSearchParams },
  );
  return { loadStudentCalendar, nextFilters, getRange: () => range! };
}

test("weekly loader honors date links and fetches the entire cross-month week with overnight padding", async () => {
  const f = fixture();
  const { body } = await f.loadStudentCalendar(
    new Request("https://lestly.test/my-schedules?date=2026-12-31"),
  );
  assert.equal(body.selectedDate, "2026-12-31");
  assert.equal(body.year, 2026);
  assert.equal(body.month, 12);
  assert.ok(f.getRange().endDate > new Date("2027-01-04T00:00:00+09:00"));
  assert.equal(body.nextSchedule?.schedule_id, 5);
  assert.deepEqual(body.disabledBookingDays, [6, 0]);
  assert.deepEqual(f.nextFilters, [
    ["cancelled_at", null],
    ["student_id", "student-a"],
    ["organization_id", "org-a"],
    ["end_time", fixedNow.toISOString()],
  ]);
});

test("legacy schedule detail links select the actual lesson date rather than the first of its month", async () => {
  const f = fixture();
  const { body } = await f.loadStudentCalendar(
    new Request(
      "https://lestly.test/my-schedules?year=2027&month=1&schedule=5",
    ),
  );
  assert.equal(body.selectedDate, "2027-01-31");
});

test("monthly list keeps its month filter and does not query a global next lesson", async () => {
  const f = fixture();
  const { body } = await f.loadStudentCalendar(
    new Request(
      "https://lestly.test/my-schedules/list?year=2027&month=2&date=invalid&book=1",
    ),
    { list: true },
  );
  assert.equal(body.selectedDate, "2027-02-01");
  assert.equal(body.month, 2);
  assert.equal(body.nextSchedule, null);
  assert.deepEqual(f.nextFilters, []);
});

test("default selected day uses the Korean year at the UTC New Year boundary", async () => {
  const f = fixture();
  const { body } = await f.loadStudentCalendar(
    new Request("https://lestly.test/my-schedules"),
  );
  assert.equal(body.selectedDate, "2027-01-01");
  assert.equal(body.year, 2027);
  assert.equal(body.month, 1);
});

test("calendar loader uses the organization window without truncating existing schedules outside it", async () => {
  const f = fixture({ mode: "rolling", daysAhead: 2 });
  const { body } = await f.loadStudentCalendar(
    new Request("https://lestly.test/my-schedules?date=2027-01-31"),
  );
  assert.equal(body.allowedEndDate, "2027-01-03T14:59:59.999Z");
  assert.equal(body.nextSchedule?.schedule_id, 5);
  assert.equal(body.selectedDate, "2027-01-31");
});

test("multi-organization calendar selects an authorized tenant and scopes its schedule queries", async () => {
  const f = fixture(
    undefined,
    [
      {
        organization_id: "org-a",
        state: "NORMAL",
        organizations: { name: "A" },
      },
      {
        organization_id: "org-b",
        state: "NORMAL",
        organizations: { name: "B" },
      },
    ],
    true,
  );
  const { body } = await f.loadStudentCalendar(
    new Request(
      "https://lestly.test/my-schedules?date=2027-01-01&organization_id=org-b",
    ),
  );
  assert.equal(body.organizationId, "org-b");
  assert.equal(body.canBook, true);
  assert.equal(f.getRange().organizationId, "org-b");
  assert.ok(
    f.nextFilters.some(
      ([key, value]) => key === "organization_id" && value === "org-b",
    ),
  );
  await assert.rejects(
    f.loadStudentCalendar(
      new Request("https://lestly.test/my-schedules?organization_id=foreign"),
    ),
    (e: any) => e.status === 403,
  );
});
