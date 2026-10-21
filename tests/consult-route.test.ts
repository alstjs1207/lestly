import assert from "node:assert/strict";
import test from "node:test";

import { requireMethod } from "../app/core/lib/guards.server.ts";
import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import { consultRequestSchema } from "../app/features/class/consult-validation.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

type Result = { data: unknown; init?: { status?: number } };
type Route = { action(args: { request: Request }): Promise<Result> };

function setup(programExists = true) {
  let reads = 0;
  const filters: Array<[string, unknown]> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const programQuery = {
    select() {
      return programQuery;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return programQuery;
    },
    single: async () => ({
      data: programExists
        ? { organization_id: "program-org", title: "Public class" }
        : null,
    }),
  };
  const client = {
    from(table: string) {
      if (table === "programs") {
        reads += 1;
        return programQuery;
      }
      assert.equal(table, "notifications");
      return {
        insert: async (values: Record<string, unknown>) => {
          inserts.push(values);
          return { error: null };
        },
      };
    },
  };
  const route = loadMockedModule<Route>(
    new URL("../app/features/class/api/consult-request.tsx", import.meta.url),
    {
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
      },
      "~/core/lib/guards.server": { requireMethod },
      "~/core/lib/request-body": { readBoundedJson, RequestBodyError },
      "~/core/lib/supa-admin-client.server": { default: client },
      "~/features/class/consult-validation": { consultRequestSchema },
    },
  );
  return {
    route,
    inserts,
    filters,
    get reads() {
      return reads;
    },
  };
}

function request(body: unknown, origin = "https://lestly.test") {
  return new Request("https://lestly.test/api/consult", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}
const valid = { programId: 12, name: " 홍길동 ", phone: "010-1234-5678" };

test("consult route rejects foreign, invalid, and oversized requests before privileged DB access", async () => {
  const state = setup();
  await assert.rejects(
    state.route.action({ request: request(valid, "https://evil.test") }),
  );
  assert.equal(
    (await state.route.action({ request: request({ ...valid, phone: 123 }) }))
      .init?.status,
    400,
  );
  assert.equal(
    (
      await state.route.action({
        request: request({ ...valid, message: "x".repeat(9000) }),
      })
    ).init?.status,
    413,
  );
  assert.equal(state.reads, 0);
  assert.equal(state.inserts.length, 0);
});

test("consult route derives tenant identity from its active program, ignoring forged fields", async () => {
  const state = setup();
  await state.route.action({
    request: request({
      ...valid,
      organization_id: "attacker-org",
      recipient_phone: "attacker-number",
    }),
  });
  assert.deepEqual(state.filters, [
    ["program_id", 12],
    ["status", "ACTIVE"],
    ["is_public", true],
  ]);
  assert.equal(state.inserts[0].organization_id, "program-org");
  assert.equal(state.inserts[0].recipient_name, "홍길동");
  assert.equal(state.inserts[0].recipient_phone, "01012345678");
});

test("consult route cannot create notifications for inactive or missing programs", async () => {
  const state = setup(false);
  assert.equal(
    (await state.route.action({ request: request(valid) })).init?.status,
    404,
  );
  assert.equal(state.inserts.length, 0);
});
