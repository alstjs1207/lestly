// Built real routes with synthetic loader fixtures; no live loaders or mutations.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from "react-router";

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
  assert.equal(context.errors, null);
  return renderToStaticMarkup(
    React.createElement(StaticRouterProvider, {
      router: createStaticRouter(handler.dataRoutes, context),
      context,
    }),
  ).split("<script")[0];
}
const consultation = {
  notification_id: 42,
  type: "CONSULT_REQUEST",
  recipient_name: "상담 신청자",
  recipient_phone: "010-1234-5678",
  consult_message:
    "기초 클래스에 관심이 있습니다.\n평일 저녁에도 수업이 가능한가요?",
  consult_status: "WAITING",
  consult_result: null,
  consult_notes: "",
  created_at: "2026-11-05T03:00:00Z",
  consult_completed_at: null,
};
const list = await render(
  "features/notifications/screens/consultations",
  "/admin/consultations",
  {
    notifications: [consultation],
    totalCount: 1,
    totalPages: 1,
    currentPage: 1,
    status: null,
  },
);
assert.match(list, /상담 관리/);
assert.match(list, /href="tel:01012345678"/);
assert.match(list, /href="\/admin\/consultations\/42"/);
assert.match(list, /평일 저녁/);
const detail = await render(
  "features/notifications/screens/consultation-detail",
  "/admin/consultations/42",
  { consultation },
);
assert.match(detail, /상담 상세/);
assert.match(detail, /name="status"/);
assert.match(detail, /name="notes"/);
assert.match(detail, /href="tel:01012345678"/);
const empty = await render(
  "features/notifications/screens/consultations",
  "/admin/consultations",
  {
    notifications: [],
    totalCount: 0,
    totalPages: 0,
    currentPage: 1,
    status: null,
  },
);
assert.match(empty, /상담 신청이 없습니다/);
const malicious = await render(
  "features/notifications/screens/consultation-detail",
  "/admin/consultations/42",
  {
    consultation: {
      ...consultation,
      recipient_name: "<script>alert(1)</script>",
      recipient_phone: null,
      consult_message: "<img src=x onerror=alert(1)>",
    },
  },
);
assert.match(malicious, /&lt;script/);
assert.doesNotMatch(malicious, /<img src=x/);
assert.doesNotMatch(malicious, /href="tel:/);
if (process.env.CONSULT_UI_OUTPUT) {
  const folder = process.env.CONSULT_UI_OUTPUT;
  await fs.mkdir(folder, { recursive: true });
  const styles = (
    await fs.readdir(new URL("../build/client/assets/", import.meta.url))
  )
    .filter((name) => name.endsWith(".css"))
    .map((name) => `<link rel="stylesheet" href="/assets/${name}">`)
    .join("");
  for (const [name, markup] of Object.entries({ list, detail, empty }))
    await fs.writeFile(
      `${folder}/${name}.html`,
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><main class="mx-auto max-w-5xl p-4 md:p-8">${markup}</main></body></html>`,
    );
}
console.log(
  "Consultation SSR passed: list/detail/empty, contact links, form and escaping verified.",
);
