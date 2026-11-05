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
assert.match(detail, /<button[^>]*>상담 삭제<\/button>/);
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
// Public class rendering preserves optional content and the existing consultation form.
const publicProgram = {
  program_id: 9,
  slug: "art_mask",
  title: "서경대 입시",
  subtitle: "아트마스크",
  description: "수업 소개\n준비물 안내",
  is_public: true,
  status: "ACTIVE",
  duration_minutes: 180,
  booking_duration_minutes: [180],
  total_sessions: 1,
  max_capacity: 10,
  location_type: "offline",
  location_address: "서울 수업 장소",
  cover_image_url: null,
  curriculum: [],
  instructor: {
    name: "강사 이름",
    photo_url: null,
    info: "수업 안내",
    career: ["지도 경력"],
    sns: { instagram: "https://www.instagram.com/example" },
  },
};
const publicFixture = {
  program: publicProgram,
  shareUrl: "https://lestly.test/class/art_mask",
  consultEnabled: true,
};
const classRoute = "features/class/screens/class-detail";
const sparseClass = await render(classRoute, "/class/art_mask", publicFixture);
assert.match(sparseClass, /<footer[^>]*aria-label="클래스 상담"/);
assert.equal((sparseClass.match(/>상담 신청</g) || []).length, 1);
assert.doesNotMatch(sparseClass, /모집 정원|일정 준비 중|다음 일정/);
assert.match(sparseClass, /회당 3시간/);
assert.match(sparseClass, /총 1회/);
assert.match(sparseClass, /지도 경력/);
assert.match(sparseClass, /장소 보기/);
assert.match(sparseClass, /grid-cols-1/);
assert.match(sparseClass, /min-h-\[180px\]/);
const coveredFixture = {
  ...publicFixture,
  program: {
    ...publicProgram,
    cover_image_url: "https://images.example.test/cover.png",
    curriculum: [{ session: 1, title: "기초 과정", description: "설명" }],
  },
};
const coveredClass = await render(
  classRoute,
  "/class/art_mask",
  coveredFixture,
);
assert.match(coveredClass, /기초 과정/);
assert.match(coveredClass, /md:grid-cols-2/);
assert.match(coveredClass, /src="https:\/\/images.example.test\/cover.png"/);
const waitingClass = await render(classRoute, "/class/art_mask", {
  ...publicFixture,
  consultEnabled: false,
});
assert.match(
  waitingClass,
  /<button[^>]*disabled=""[^>]*>[\s\S]*상담 신청 준비 중/,
);
const emptyClass = await render(classRoute, "/class/art_mask", {
  ...publicFixture,
  program: { ...publicProgram, instructor: null, curriculum: [] },
});
assert.doesNotMatch(emptyClass, /md:grid-cols-2|강사 이름|커리큘럼/);
const meta = (fixture) =>
  build.routes[classRoute].module.meta({ data: fixture });
const social = meta(coveredFixture);
assert.ok(
  social.some(
    (m) =>
      m.property === "og:image" &&
      m.content === coveredFixture.program.cover_image_url,
  ),
);
assert.ok(
  social.some(
    (m) => m.property === "og:url" && m.content === publicFixture.shareUrl,
  ),
);
assert.ok(
  social.some(
    (m) => m.name === "twitter:card" && m.content === "summary_large_image",
  ),
);
assert.ok(
  social.some((m) => m.tagName === "link" && m.href === publicFixture.shareUrl),
);
const noImage = meta({
  ...publicFixture,
  program: {
    ...publicProgram,
    subtitle: "",
    cover_image_url: "javascript:alert(1)",
  },
});
assert.ok(
  !noImage.some((m) => m.property === "og:image" || m.name === "twitter:image"),
);
assert.ok(
  noImage.some(
    (m) => m.name === "description" && m.content === "수업 소개 준비물 안내",
  ),
);
const adminRoute = "features/admin/screens/programs/detail";
const activeAdmin = await render(adminRoute, "/admin/programs/9", {
  program: publicProgram,
  hasSchedules: true,
});
assert.match(activeAdmin, /href="\/class\/art_mask"/);
for (const flags of [
  { is_public: false, status: "ACTIVE" },
  { is_public: true, status: "DRAFT" },
  { is_public: true, status: "ARCHIVED" },
]) {
  const hidden = await render(adminRoute, "/admin/programs/9", {
    program: { ...publicProgram, ...flags },
    hasSchedules: true,
  });
  assert.doesNotMatch(hidden, /href="\/class\/art_mask"/);
  assert.match(hidden, /공개되지 않음/);
  assert.match(hidden, /상태를 ‘활성’으로 설정/);
}
const coverEditor = await render(
  "features/admin/screens/programs/edit",
  "/admin/programs/9/edit",
  {
    program: coveredFixture.program,
    instructors: [],
  },
);
assert.match(coverEditor, /모바일 커버 미리보기/);
assert.match(coverEditor, /PC 커버 미리보기/);
assert.match(coverEditor, /name="existing_cover_image_url"/);
if (process.env.CONSULT_UI_OUTPUT) {
  const folder = process.env.CONSULT_UI_OUTPUT;
  await fs.mkdir(folder, { recursive: true });
  const styles = (
    await fs.readdir(new URL("../build/client/assets/", import.meta.url))
  )
    .filter((name) => name.endsWith(".css"))
    .map((name) => `<link rel="stylesheet" href="/assets/${name}">`)
    .join("");
  for (const [name, markup] of Object.entries({
    list,
    detail,
    empty,
    sparseClass,
    coveredClass,
    waitingClass,
    coverEditor,
  }))
    await fs.writeFile(
      `${folder}/${name}.html`,
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${styles}</head><body><main class="mx-auto max-w-5xl p-4 md:p-8">${markup}</main></body></html>`,
    );
}
console.log(
  "Consultation SSR passed: management/history/escaping; public CTA, optional content, social metadata, publication states and cover previews verified.",
);
