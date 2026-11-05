import assert from "node:assert/strict";
import test from "node:test";

import { requireMethod } from "../app/core/lib/guards.server.ts";
import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import { publicConsultRequestSchema } from "../app/features/class/consult-validation.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

type Result = {
  data: { success?: boolean; error?: string };
  init: { status?: number; headers?: Record<string, string> };
};
const input = {
  programId: 1,
  name: " 신청자 ",
  phone: "010-1234-5678",
  message: " 문의 ",
  requestId: "60000000-0000-4000-8000-000000000001",
};
function setup({
  configured = true,
  ip = "127.0.0.1" as string | null,
  budget = true,
  accepted = false,
  id = 12 as number | null,
  failure = "",
} = {}) {
  const calls: string[] = [];
  const stored: any[] = [];
  const route = loadMockedModule<{
    action(args: { request: Request }): Promise<Result>;
  }>(
    new URL("../app/features/class/api/consult-request.tsx", import.meta.url),
    {
      "react-router": {
        data: (data: unknown, init: unknown) => ({ data, init }),
      },
      "~/core/lib/guards.server": { requireMethod },
      "~/core/lib/request-body": { RequestBodyError, readBoundedJson },
      "~/features/notifications/push/dispatch.server": {
        dispatchConsultPush: async () => {
          calls.push("push");
        },
      },
      "../consult-validation": { publicConsultRequestSchema },
      "../consult-security.server": {
        getConsultConfig: () =>
          configured ? { secret: "s".repeat(32) } : null,
        consultClientIp: () => ip,
        consultHash: (_secret: string, kind: string, value: string) => {
          assert.ok(value);
          return kind + "-hash";
        },
      },
      "../consult-store.server": {
        consumeConsultIpBudget: async () => {
          calls.push("budget");
          return budget;
        },
        findAcceptedConsultation: async () => {
          calls.push("find");
          return accepted ? 12 : null;
        },
        submitConsultation: async (value: unknown) => {
          calls.push("insert");
          stored.push(value);
          if (failure) throw new Error(failure);
          return id;
        },
      },
    },
  );
  const request = (body: unknown = input, origin = "https://lestly.test") =>
    new Request("https://lestly.test/api/consult-request", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  return { route, calls, stored, request };
}

test("consult fails closed before DB access when security configuration or trusted IP is unavailable", async () => {
  for (const options of [{ configured: false }, { ip: null }]) {
    const s = setup(options);
    const result = await s.route.action({ request: s.request() });
    assert.equal(result.init.status, 503);
    assert.equal(result.init.headers?.["Cache-Control"], "no-store");
    assert.deepEqual(s.calls, []);
  }
});

test("consult rejects wrong methods, foreign origins, oversized/invalid JSON and malformed fields before storage", async () => {
  const s = setup();
  await assert.rejects(
    s.route.action({
      request: new Request("https://lestly.test/api/consult-request", {
        method: "DELETE",
      }),
    }),
  );
  await assert.rejects(
    s.route.action({ request: s.request(input, "https://evil.test") }),
  );
  assert.equal(
    (await s.route.action({ request: s.request("invalid") })).init.status,
    400,
  );
  assert.equal(
    (
      await s.route.action({
        request: s.request('"' + "한".repeat(6000) + '"'),
      })
    ).init.status,
    413,
  );
  for (const value of [
    { ...input, programId: -1 },
    { ...input, name: "" },
    { ...input, phone: 123 },
    { ...input, requestId: "not-a-uuid" },
    { ...input, message: "x".repeat(2001) },
  ])
    assert.equal(
      (await s.route.action({ request: s.request(value) })).init.status,
      400,
    );
  assert.deepEqual(s.calls, []);
});

test("consult IP budget rejects excess requests before lookup, storage or dispatch", async () => {
  const s = setup({ budget: false });
  assert.equal(
    (await s.route.action({ request: s.request() })).init.status,
    429,
  );
  assert.deepEqual(s.calls, ["budget"]);
});

test("consult normalizes contact input, ignores forged organization/status and dispatches only the committed consultation", async () => {
  const s = setup();
  const result = await s.route.action({
    request: s.request({
      ...input,
      organizationId: "foreign",
      consult_status: "COMPLETED",
    }),
  });
  assert.equal(result.data.success, true);
  assert.deepEqual(s.calls, ["budget", "find", "insert", "push"]);
  assert.deepEqual(JSON.parse(JSON.stringify(s.stored[0])), {
    programId: 1,
    name: "신청자",
    phone: "01012345678",
    message: "문의",
    requestId: input.requestId,
    payloadHash: "payload-hash",
    phoneHash: "phone-hash",
  });
});

test("committed consult retries succeed without a second consultation or push", async () => {
  const s = setup({ accepted: true });
  assert.equal(
    (await s.route.action({ request: s.request() })).data.success,
    true,
  );
  assert.deepEqual(s.calls, ["budget", "find"]);
});

test("consult storage limits and transaction errors never report success, leak DB details or send push", async () => {
  for (const [options, expected] of [
    [{ id: null }, 429],
    [{ failure: "consult_program_unavailable" }, 404],
    [{ failure: "consult_request_conflict" }, 409],
    [{ failure: "DB failure with private phone" }, 503],
  ] as const) {
    const s = setup(options);
    const result = await s.route.action({ request: s.request() });
    assert.equal(result.init.status, expected);
    assert.ok(!result.data.success);
    assert.ok(!JSON.stringify(result).includes("private phone"));
    assert.ok(!s.calls.includes("push"));
  }
});
