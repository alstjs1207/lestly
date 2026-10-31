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
const sectionForms =
  settings.split("<script")[0].match(/<form\b[\s\S]*?<\/form>/g) ?? [];
const scopeForms = sectionForms.filter((markup) =>
  markup.includes('name="section"'),
);
assert.equal(scopeForms.length, 5);
const scopeForm = (id) =>
  scopeForms.find((markup) => markup.includes(`name="section" value="${id}"`));
assert.match(scopeForm("class_defaults"), /name="durationMinutes"/);
assert.doesNotMatch(
  scopeForm("class_defaults"),
  /name="firstStart"|name="cancellationMode"/,
);
assert.match(scopeForm("booking_times"), /name="firstStart"/);
assert.doesNotMatch(
  scopeForm("booking_times"),
  /name="durationMinutes"|name="max_concurrent_students"/,
);
assert.match(scopeForm("booking_window"), /예약 기간 저장/);
assert.doesNotMatch(
  scopeForm("booking_window"),
  /name="cancellationMode"|name="durationMinutes"/,
);
assert.match(scopeForm("booking_days"), /휴무 요일 저장/);
assert.match(scopeForm("cancellation_policy"), /취소 기한 저장/);
assert.match(settings, /설정 영역 바로가기/);
// All forms stay mounted for mobile tab changes and desktop still renders all sections.
assert.match(settings, /role="tablist"[^>]*aria-label="설정 영역 선택"/);
assert.equal(
  (settings.split("<script")[0].match(/role="tab"/g) ?? []).length,
  6,
);
for (const panel of [
  "class-defaults",
  "booking-window",
  "booking-times",
  "booking-days",
  "cancellation-policy",
  "student-types",
])
  assert.match(settings, new RegExp(`data-settings-panel="${panel}"`));

assert.match(settings, /다른 영역에 입력 중인 내용은 유지됩니다/);
const fixture = {
  year: 2026,
  month: 10,
  now: "2026-10-26T00:00:00Z",
  selectedDate: "2026-10-27",
  nextSchedule: null,
  schedules: [],
  programs: [
    {
      program_id: 1,
      title: "분 단위 클래스",
      duration_minutes: 40,
      booking_duration_minutes: [40, 50, 90],
      max_capacity: 2,
    },
  ],
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
  programs: [
    {
      program_id: 1,
      title: "분 단위 클래스",
      duration_minutes: 40,
      booking_duration_minutes: [40, 50, 90],
      max_capacity: 2,
    },
  ],
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
      program_id: 1,
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
const ownClass = await render(
  "features/admin/screens/schedules/create",
  "/admin/schedules/new",
  {
    ...common,
    programs: [
      {
        program_id: 1,
        title: "클래스 자체 90분",
        subtitle: null,
        duration_minutes: 90,
        booking_duration_minutes: [90, 120],
        max_capacity: 2,
      },
    ],
  },
);
assert.match(ownClass, /name="duration_minutes"/);
assert.match(ownClass, /1시간 30분/);
assert.doesNotMatch(ownClass, /40분/);
const noClass = await render(
  "features/admin/screens/schedules/create",
  "/admin/schedules/new",
  { ...common, programs: [] },
);
assert.match(noClass, /예약할 활성 클래스가 없습니다/);
assert.match(noClass, /href="\/admin\/programs\/new"/);
assert.doesNotMatch(noClass, /name="duration_minutes"/);
const newClass = await render(
  "features/admin/screens/programs/create",
  "/admin/programs/new",
  {
    instructors: [],
    defaults: {
      duration_minutes: 50,
      booking_duration_minutes: [50, 90],
      max_capacity: 7,
    },
  },
);
assert.match(newClass, /name="duration_minutes"[^>]*value="50"/);
assert.match(newClass, /name="max_capacity"[^>]*value="7"/);
assert.match(newClass, /기존 클래스는 유지/);
console.log(
  "Booking policy SSR passed: settings preview, minute bookings, admin create and unchanged legacy duration/start.",
);
