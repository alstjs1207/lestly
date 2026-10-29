// Built-route verification with fixtures. No live users, credentials or writes.
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
async function render(id, path, fixture) {
  const route = build.routes[id];
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
const policy = {
  durationMinutes: [180, 360, 540],
  defaultDurationMinutes: 180,
  firstStart: "09:00",
  lastStart: "20:00",
  startIntervalMinutes: 30,
  leadMinutes: 0,
  bookingWindow: { mode: "monthly", openingDay: 31 },
};
const settings = {
  now: "2026-11-30T00:00:00+09:00",
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
  disabledBookingTimes: [],
  disabledBookingDays: [],
};
const monthly = await render(
  "features/admin/screens/settings",
  "/admin/settings",
  settings,
);
assert.match(monthly, /name="bookingOpeningDay"/);
assert.doesNotMatch(monthly, /name="bookingDaysAhead"/);
assert.match(monthly, /2026-12-31/);
assert.match(monthly, /말일에/);
const rollingPolicy = {
  ...policy,
  bookingWindow: { mode: "rolling", daysAhead: 14 },
};
const rolling = await render(
  "features/admin/screens/settings",
  "/admin/settings",
  {
    ...settings,
    now: "2026-10-29T08:00:00+09:00",
    bookingPolicy: rollingPolicy,
  },
);
assert.match(rolling, /name="bookingDaysAhead"/);
assert.doesNotMatch(rolling, /name="bookingOpeningDay"/);
assert.match(rolling, /2026-11-12/);
const student = {
  now: "2026-10-29T08:00:00+09:00",
  year: 2026,
  month: 11,
  selectedDate: "2026-11-13",
  nextSchedule: null,
  programs: [],
  canBook: true,
  classStartDate: null,
  classEndDate: null,
  disabledBookingDays: [],
  bookingPolicy: rollingPolicy,
  allowedStartDate: "2026-10-29T00:00:00+09:00",
  allowedEndDate: "2026-11-12T23:59:59.999+09:00",
  schedules: [
    {
      schedule_id: 1,
      start_time: "2026-11-13T01:00:00Z",
      end_time: "2026-11-13T04:00:00Z",
      program: { program_id: 1, title: "범위 밖 기존 예약" },
      attendance_status: "PENDING",
    },
  ],
};
for (const [id, path] of [
  ["calendar", "/my-schedules"],
  ["my-schedules", "/my-schedules/list"],
]) {
  const markup = await render(
    `features/schedules/screens/${id}`,
    path,
    student,
  );
  assert.match(markup, /14일 뒤까지/);
  assert.doesNotMatch(markup, /매월 25일/);
  assert.match(markup, /범위 밖 기존 예약/);
}
console.log(
  "Booking window SSR passed: exclusive fields, month-end preview, rolling limits and existing out-of-window reservations.",
);
