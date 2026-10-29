import dotenv from "dotenv";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from "react-router";

dotenv.config({ quiet: true });
const build = await import("../build/server/index.js");
const policy = {
  durationMinutes: [40, 50, 90],
  defaultDurationMinutes: 40,
  firstStart: "09:10",
  lastStart: "20:00",
  startIntervalMinutes: 50,
  leadMinutes: 60,
  bookingWindow: { mode: "monthly", openingDay: 25 },
};
async function render(id, path, fixture) {
  const route = build.routes[id];
  assert.equal(typeof route?.module.default, "function", id);
  const handler = createStaticHandler([
    {
      id: route.id,
      path,
      Component: route.module.default,
      loader: () => fixture,
    },
  ]);
  const context = await handler.query(
    new Request(`https://lestly.test${path}`),
  );
  assert.ok(!(context instanceof Response));
  assert.equal(context.errors, null);
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
    }),
  );
}
const settings = await render(
  "features/admin/screens/settings",
  "/admin/settings",
  {
    now: "2026-10-29T00:00:00Z",
    bookingPolicy: policy,
    studentTypes: [
      {
        code: "STUDENT",
        label: "학생",
        sort_order: 0,
        is_active: true,
        is_default: true,
      },
    ],
    maxConcurrentStudents: 5,
    disabledBookingTimes: ["12:30"],
    disabledBookingDays: [],
  },
);
assert.match(settings, /시작 시간 간격/);
assert.match(settings, /시간표 미리보기/);
assert.match(settings, /09:10~09:50/);
assert.match(settings, /10:00~10:40/);
assert.match(settings, /name="durationMinutes"[^>]*value="40, 50, 90"/);
assert.match(settings, /name="leadMinutes"[^>]*value="60"/);
assert.match(settings, /12:30/);
const fixture = {
  year: 2026,
  month: 10,
  now: "2026-10-26T00:00:00Z",
  selectedDate: "2026-10-27",
  nextSchedule: null,
  schedules: [],
  programs: [],
  classStartDate: "2026-10-01",
  classEndDate: "2026-11-30",
  allowedStartDate: "2026-10-26T00:00:00+09:00",
  allowedEndDate: "2026-11-30T23:59:59+09:00",
  canBook: true,
  bookingPolicy: policy,
};
const weekly = await render(
  "features/schedules/screens/calendar",
  "/my-schedules",
  fixture,
);
assert.match(weekly, /40분 수업 예약하기/);
assert.doesNotMatch(weekly, /3시간 수업 예약하기/);
const common = {
  bookingPolicy: policy,
  students: [
    {
      profile_id: "test-student",
      name: "샘플 수강생",
      region: null,
      phone: null,
    },
  ],
  programs: [],
};
const create = await render(
  "features/admin/screens/schedules/create",
  "/admin/schedules/new",
  common,
);
assert.match(create, /name="duration_minutes"/);
assert.match(create, /40분/);
assert.match(create, /09:10/);
const edit = await render(
  "features/admin/screens/schedules/edit",
  "/admin/schedules/10/edit",
  {
    ...common,
    isPast: false,
    schedule: {
      schedule_id: 10,
      student_id: "test-student",
      program_id: null,
      start_time: "2099-01-01T21:15:00+09:00",
      end_time: "2099-01-02T00:15:00+09:00",
      student: { name: "샘플 수강생" },
      rrule: null,
    },
  },
);
assert.match(edit, /3시간 \(기존\)/);
assert.match(edit, /21:15 \(기존\)/);
assert.match(edit, /name="duration_minutes"/);
console.log(
  "Booking policy SSR passed: settings preview, minute bookings, admin create and unchanged legacy duration/start.",
);
