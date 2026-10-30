// Built route coverage for Phase 6. Fixtures never invoke live loaders or mutations.
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

import { learningHeatmap } from "../app/features/schedules/utils/learning-records.ts";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const build = await import("../build/server/index.js");
async function render(id, path, fixture) {
  const route = build.routes[id];
  assert.equal(typeof route?.module.default, "function");
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
  ).split("<script")[0];
}
const now = "2026-10-30T03:00:00Z";
const program = {
  program_id: 1,
  title: "온라인 과외",
  location_type: "online",
  location_address: "이전 오프라인 주소",
};
const schedule = {
  schedule_id: 1,
  start_time: "2026-10-29T01:00:00Z",
  end_time: "2026-10-29T01:50:00Z",
  attendance_status: "PRESENT",
  program,
};
const home = {
  profileId: "fixture",
  name: "검증",
  now,
  classStartDate: null,
  classEndDate: null,
  totalHours: 1,
  thisMonthHours: 1,
  thisMonthCount: 1,
  upcomingCount: 1,
  nextSchedule: {
    ...schedule,
    start_time: "2026-11-01T01:00:00Z",
    end_time: "2026-11-01T01:50:00Z",
  },
  chart: [],
};
const online = await render(
  "features/users/screens/coaching-dashboard",
  "/dashboard",
  home,
);
assert.match(online, /온라인 수업 · 접속 방법은 담당 강사/);
assert.doesNotMatch(online, /이전 오프라인 주소|학원/);
const ended = await render(
  "features/users/screens/coaching-dashboard",
  "/dashboard",
  { ...home, graduated: true },
);
assert.match(ended, /이 운영 공간의 수강이 종료된 상태/);
assert.doesNotMatch(ended, /href="\/my-schedules\?book=1"/);
const records = await render(
  "features/users/screens/learning-records",
  "/learning-records",
  {
    profileId: "fixture",
    now,
    year: 2026,
    month: 10,
    all: false,
    firstMonth: "2026-10",
    schedules: [schedule],
    heatmap: learningHeatmap([schedule], new Date(now)),
    totalHours: 0.8,
    periodHours: 0.8,
  },
);
assert.match(records, /수업 1회 · 총 50분/);
assert.match(records, /하루 참여 횟수/);
assert.doesNotMatch(records, /6시간 미만|9시간\+/);
const types = [
  {
    code: "ADULT",
    label: "성인",
    is_active: true,
    is_default: true,
    sort_order: 0,
  },
];
const blank = await render(
  "features/admin/screens/students/create",
  "/admin/students/new",
  { studentTypes: types },
);
assert.match(blank, /<details class="[^"]*">/);
assert.match(blank, /보호자 정보 \(선택\)/);
const edit = await render(
  "features/admin/screens/students/edit",
  "/admin/students/fixture/edit",
  {
    studentTypes: types,
    student: {
      profile_id: "fixture",
      name: "검증",
      type: "ADULT",
      phone: "01000000000",
      parent_name: "기존 보호자",
      parent_phone: "01011111111",
    },
  },
);
assert.match(edit, /<details[^>]*open=""/);
assert.match(edit, /name="parent_name"[^>]*value="기존 보호자"/);
assert.match(edit, /name="parent_phone"[^>]*value="01011111111"/);
const catalog = await render(
  "features/admin/screens/programs/create",
  "/admin/programs/new",
  { instructors: [] },
);
assert.match(catalog, /이 클래스의 실제 예약에 적용/);
assert.match(catalog, /반복 예약은 이 횟수가 아닌/);
assert.match(catalog, /같은 시간대 수업에 참여할 수 있는 최대 인원/);
console.log(
  "Phase 6 built-route SSR passed: online home, ended access, short lesson heatmap, optional guardian data and catalog policy guidance.",
);
