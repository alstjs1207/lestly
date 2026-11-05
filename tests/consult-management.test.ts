import assert from "node:assert/strict";
import test from "node:test";

import { requireMethod } from "../app/core/lib/guards.server.ts";
import * as validation from "../app/features/notifications/consult-validation.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function setup(authorized = true, found = true) {
  const filters: unknown[] = [],
    updates: unknown[] = [];
  const chain = {
    select() {
      return chain;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return chain;
    },
    update(value: unknown) {
      updates.push(value);
      return chain;
    },
    async maybeSingle() {
      return {
        data: found ? { notification_id: 12, type: "CONSULT_REQUEST" } : null,
        error: null,
      };
    },
  };
  const route = loadMockedModule<any>(
    new URL(
      "../app/features/notifications/screens/consultation-detail.tsx",
      import.meta.url,
    ),
    {
      "react/jsx-runtime": {},
      "react-router": {
        data: (data: unknown, init: unknown) => ({ data, init }),
      },
      "~/core/components/ui/button": {},
      "~/core/components/ui/card": {},
      "~/core/components/ui/label": {},
      "~/core/components/ui/textarea": {},
      "~/core/lib/guards.server": { requireMethod },
      "~/core/lib/supa-client.server": {
        default: () => [{ from: () => chain }, new Headers()],
      },
      "~/features/admin/guards.server": {
        requireAdminRole: async () => {
          if (!authorized) throw new Response(null, { status: 403 });
          return { organizationId: "own" };
        },
      },
      "../consult-validation": validation,
    },
  );
  const request = (
    values: Record<string, string> = {
      status: "COMPLETED",
      result: "SUCCESS",
      notes: "checked",
    },
    origin = "https://lestly.test",
  ) =>
    new Request("https://lestly.test/admin/consultations/12", {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams(values),
    });
  return { route, filters, updates, request };
}

test("consult detail refuses foreign origins and unauthorized users before mutation", async () => {
  let s = setup();
  await assert.rejects(
    s.route.action({
      request: s.request(undefined, "https://evil.test"),
      params: { consultationId: "12" },
    }),
  );
  assert.equal(s.updates.length, 0);
  s = setup(false);
  await assert.rejects(
    s.route.loader({
      request: new Request("https://lestly.test/admin/consultations/12"),
      params: { consultationId: "12" },
    }),
  );
  await assert.rejects(
    s.route.action({ request: s.request(), params: { consultationId: "12" } }),
  );
  assert.equal(s.updates.length, 0);
});

test("consult detail validates exact IDs, enum values and notes and updates only whitelisted fields in the authorized tenant", async () => {
  const s = setup();
  for (const id of ["12x", "0", "-1", "1.5", "9007199254740992"])
    assert.equal(
      (
        await s.route.action({
          request: s.request(),
          params: { consultationId: id },
        })
      ).init.status,
      404,
    );
  for (const values of [
    { status: "INVALID", result: "", notes: "" },
    { status: "WAITING", result: "INVALID", notes: "" },
    { status: "WAITING", result: "", notes: "x".repeat(5001) },
  ])
    assert.equal(
      (
        await s.route.action({
          request: s.request(values),
          params: { consultationId: "12" },
        })
      ).init.status,
      400,
    );
  assert.equal(s.updates.length, 0);
  const result = await s.route.action({
    request: s.request({
      status: "WAITING",
      result: "",
      notes: " note ",
      organization_id: "foreign",
      recipient_phone: "fake",
    }),
    params: { consultationId: "12" },
  });
  assert.equal(result.data.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(s.updates)), [
    { consult_status: "WAITING", consult_result: null, consult_notes: "note" },
  ]);
  assert.deepEqual(s.filters, [
    ["organization_id", "own"],
    ["notification_id", 12],
    ["type", "CONSULT_REQUEST"],
  ]);
  assert.equal(result.init.headers.get("Cache-Control"), "no-store");
});

test("consult detail returns not-found rather than success for another tenant's or non-consultation ID", async () => {
  const s = setup(true, false);
  assert.equal(
    (
      await s.route.action({
        request: s.request(),
        params: { consultationId: "12" },
      })
    ).init.status,
    404,
  );
});

test("consultation phone links normalize only valid Korean telephone numbers", () => {
  assert.equal(
    validation.consultationPhone("010-1234-5678"),
    "tel:01012345678",
  );
  assert.equal(validation.consultationPhone("02-123-4567"), "tel:021234567");
  for (const phone of [null, "", "javascript:alert(1)", "123", "+1 555 1234"])
    assert.equal(validation.consultationPhone(phone), undefined);
});
