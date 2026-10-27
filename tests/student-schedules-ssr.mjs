// Run after npm run build. Exercise the built framework routes, including the
// route-to-component loaderData handoff, without live accounts or writes.
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
const nextSchedule = {
  schedule_id: 1,
  start_time: "2026-10-27T01:00:00Z",
  end_time: "2026-10-27T04:00:00Z",
  attendance_status: "PENDING",
  program: { program_id: 1, title: "SSR 예약 검증 수업" },
};
const fixture = {
  year: 2026,
  month: 10,
  now: "2026-10-26T00:00:00Z",
  selectedDate: "2026-10-26",
  nextSchedule,
  schedules: [nextSchedule],
  programs: [nextSchedule.program],
  classStartDate: "2026-10-01",
  classEndDate: "2026-11-30",
  allowedStartDate: "2026-10-26T00:00:00+09:00",
  allowedEndDate: "2026-11-30T23:59:59+09:00",
  canBook: true,
};
async function render(name, path, values) {
  const route = build.routes[`features/schedules/screens/${name}`];
  assert.equal(typeof route?.module.default, "function");
  const handler = createStaticHandler([
    {
      id: route.id,
      path,
      Component: route.module.default,
      loader: () => values,
    },
  ]);
  const context = await handler.query(
    new Request(`https://lestly.test${path}`),
  );
  assert.ok(!(context instanceof Response));
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
    }),
  );
}
assert.equal(
  typeof build.routes["features/schedules/screens/calendar"].module
    .shouldRevalidate,
  "function",
);
const weekly = await render("calendar", "/my-schedules", fixture);
assert.match(weekly, /주간 수업 예약/);
assert.match(weekly, /SSR 예약 검증 수업/);
assert.match(weekly, /다가오는 내 수업/);
assert.match(weekly, /11월 1일/);
assert.match(weekly, /수업 예약 패널/);
assert.equal(
  (weekly.match(/aria-pressed="(?:true|false)" aria-current=/g) ?? []).length,
  1,
);
assert.doesNotMatch(weekly, /월간 수업 캘린더|캘린더를 불러오고/);
const readonly = await render("calendar", "/my-schedules", {
  ...fixture,
  canBook: false,
});
assert.match(readonly, /예약 가능한 수강생 계정인지/);
const closed = await render("calendar", "/my-schedules", {
  ...fixture,
  disabledBookingDays: [1, 2],
});
assert.match(closed, /휴무일로 신규 예약을 받지 않아요/);
assert.match(closed, /SSR 예약 검증 수업/); // Existing reservations stay visible.
assert.match(closed, /휴무일/);
assert.doesNotMatch(closed, /가능 시간 확인 중/);
const list = await render("my-schedules", "/my-schedules/list", fixture);
assert.match(list, /등록된 수업 목록/);
assert.match(list, /조회 월/);
assert.doesNotMatch(list, /주간 수업 예약/);
console.log(
  "Student schedule SSR passed: weekly booking, read-only account and monthly list rendered from built routes.",
);
