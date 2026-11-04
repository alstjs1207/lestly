import assert from "node:assert/strict";
import test from "node:test";

import * as catalog from "../app/features/admin/lib/catalog-form.server.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function instructorRoute() {
  let allowed = true;
  let reject = false;
  const writes: Record<string, unknown>[] = [];
  const route = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL(
      "../app/features/admin/api/instructors/create.tsx",
      import.meta.url,
    ),
    {
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
        redirect: (url: string, init: unknown) => ({ url, init }),
      },
      "~/core/lib/guards.server": {
        requireMethod: (method: string) => (request: Request) => {
          assert.equal(request.method, method);
        },
      },
      "~/core/lib/supa-admin-client.server": { default: {} },
      "~/core/lib/supa-client.server": { default: () => [{}, new Headers()] },
      "~/features/instructors/queries": {
        createInstructor: async (
          _: unknown,
          fields: Record<string, unknown>,
        ) => {
          if (reject) throw new Error("save failed");
          writes.push(fields);
          return { ...fields, instructor_id: 42 };
        },
      },
      "~/features/notifications/push/store.server": {
        isInstructorPushAccount: async (_: string, profile: string | null) =>
          profile === null,
      },
      "../../guards.server": {
        requireAdminRole: async () => {
          if (!allowed) throw new Response(null, { status: 403 });
          return { organizationId: "session-org" };
        },
      },
      "../../lib/catalog-form.server": catalog,
    },
  );
  return {
    writes,
    allow: (value: boolean) => {
      allowed = value;
    },
    reject: (value: boolean) => {
      reject = value;
    },
    run: (fields: Record<string, string>) =>
      route.action({
        request: new Request(
          "https://lestly.test/api/admin/instructors/create",
          { method: "POST", body: new URLSearchParams(fields) },
        ),
      }),
  };
}

test("inline instructor creation returns the saved ID in the authenticated organization while normal creation still redirects", async () => {
  const f = instructorRoute();
  const inline = await f.run({
    response_mode: "inline",
    name: " 새 강사 ",
    info: "소개",
    organization_id: "attacker-org",
  });
  assert.equal(inline.body.success, true);
  assert.equal(inline.body.instructor.instructor_id, 42);
  assert.equal(inline.body.instructor.name, "새 강사");
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].organization_id, "session-org");
  assert.equal(f.writes[0].push_profile_id, null);
  assert.equal((await f.run({ name: "일반 등록" })).url, "/admin/instructors");
});

test("inline instructor creation validates input, permissions and failures without redirecting or writing invalid input", async () => {
  const f = instructorRoute();
  const invalidInputs: Record<string, string>[] = [
    { name: " " },
    { name: "강사", push_profile_id: "10000000-0000-4000-8000-000000000001" },
  ];
  for (const fields of invalidInputs) {
    const result = await f.run({ ...fields, response_mode: "inline" });
    assert.equal(result.init.status, 400);
    assert.equal(result.url, undefined);
  }
  assert.equal(f.writes.length, 0);
  f.allow(false);
  await assert.rejects(
    () => f.run({ response_mode: "inline", name: "강사" }),
    (e: any) => e.status === 403,
  );
  assert.equal(f.writes.length, 0);
  f.allow(true);
  f.reject(true);
  const result = await f.run({ response_mode: "inline", name: "유지할 입력" });
  assert.equal(result.init.status, 500);
  assert.match(result.body.error, /저장하지 못/);
  assert.equal(result.url, undefined);
});
