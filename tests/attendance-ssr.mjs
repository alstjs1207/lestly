// Run after npm run build. Exercise the actual transformed route module, rather
// than passing loaderData directly to a component and bypassing framework SSR.
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
const route = build.routes["features/attendance/screens/attendance"];
assert.equal(
  typeof route?.module.default,
  "function",
  "Built attendance route is missing",
);
const fixture = {
  date: "2026-10-25",
  pendingOnly: false,
  page: 1,
  totalCount: 1,
  now: "2026-10-26T00:00:00Z",
  schedules: [
    {
      schedule_id: 1,
      student_id: "ssr-fixture",
      program_id: null,
      start_time: "2026-10-25T01:00:00Z",
      end_time: "2026-10-25T04:00:00Z",
      attendance_status: "PENDING",
      attendance_version: 0,
      attendance_updated_at: null,
      cancelled_at: null,
      student: { name: "SSR 검증 수강생" },
      program: null,
    },
  ],
};
const handler = createStaticHandler([
  {
    id: route.id,
    path: "/admin/attendance",
    Component: route.module.default,
    loader: () => fixture,
  },
]);
const context = await handler.query(
  new Request("https://lestly.test/admin/attendance"),
);
assert.ok(!(context instanceof Response));
const router = createStaticRouter(handler.dataRoutes, context);
const markup = renderToStaticMarkup(
  React.createElement(StaticRouterProvider, { router, context }),
);
assert.match(markup, /SSR 검증 수강생/);
assert.match(markup, /출결 관리/);
assert.match(markup, /미확인/);
assert.match(markup, /2026-10-25/);
console.log(
  "Attendance SSR passed: built route received loader data and rendered the roster.",
);
