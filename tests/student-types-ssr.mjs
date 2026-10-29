// Exercise the actual built route modules with isolated loader fixtures, without a DB.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from "react-router";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const build = await import("../build/server/index.js");
const types = [
  {
    code: "TYPE_CHILD",
    label: "어린이",
    sort_order: 0,
    is_active: true,
    is_default: true,
  },
  {
    code: "STUDENT",
    label: "청소년",
    sort_order: 1,
    is_active: false,
    is_default: false,
  },
  {
    code: "ADULT",
    label: "성인",
    sort_order: 2,
    is_active: true,
    is_default: false,
  },
];
async function render(id, path, fixture) {
  const route = build.routes[id];
  assert.equal(typeof route?.module.default, "function", `${id} missing`);
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
  if (context instanceof Response)
    throw new Error(`Unexpected redirect ${context.status}`);
  assert.equal(context.errors, null);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, { router, context }),
  );
}
const settings = await render(
  "features/admin/screens/settings",
  "/admin/settings",
  {
    studentTypes: types,
    maxConcurrentStudents: 5,
    bookingPolicy: {
      durationMinutes: [180, 360, 540],
      defaultDurationMinutes: 180,
      firstStart: "09:00",
      lastStart: "20:00",
      startIntervalMinutes: 30,
      leadMinutes: 0,
    },
    scheduleDurationHours: 3,
    timeSlotIntervalMinutes: 30,
    disabledBookingTimes: [],
    disabledBookingDays: [],
  },
);
assert.ok(settings.includes("유형 설정 저장"));
assert.ok(settings.includes('value="청소년"'));
assert.ok(settings.includes("어린이 기본값"));
const bulk = await render(
  "features/admin/screens/students/bulk-create",
  "/admin/students/bulk",
  { studentTypes: types, draftKey: "isolated-ssr" },
);
assert.ok(bulk.includes("어린이"));
assert.ok(bulk.includes('value="TYPE_CHILD"'));
assert.ok(
  !bulk.includes('value="STUDENT"'),
  "Inactive type must not be a new-registration option",
);
const student = {
  profile_id: "fixture",
  name: "샘플 학생",
  state: "NORMAL",
  type: "STUDENT",
  region: null,
  auth_user_id: null,
};
const list = await render(
  "features/admin/screens/students/list",
  "/admin/students",
  {
    studentTypes: types,
    students: [student],
    totalCount: 1,
    totalPages: 1,
    currentPage: 1,
    totalHours: Promise.resolve({ fixture: 0 }),
  },
);
assert.ok(list.includes("청소년"));
assert.ok(
  list.includes("청소년 (사용 중지)"),
  "Inactive classifications stay searchable",
);
const detail = await render(
  "features/admin/screens/students/detail",
  "/admin/students/fixture",
  {
    studentTypes: types,
    student,
    weeklySchedules: [],
    nextWeekSchedules: [],
    monthlySchedules: [],
    nextMonthSchedules: [],
    currentYear: 2026,
    currentMonth: 10,
    nextMonthYear: 2026,
    nextMonth: 11,
    totalHours: Promise.resolve({ fixture: 0 }),
  },
);
assert.ok(detail.includes("청소년"));
console.log(
  "Student type SSR passed: settings, custom bulk defaults, inactive filters and renamed detail labels.",
);
