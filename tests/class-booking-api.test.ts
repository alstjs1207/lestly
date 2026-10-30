import assert from "node:assert/strict";
import test from "node:test";

import * as catalog from "../app/features/admin/lib/catalog-form.server.ts";
import { DEFAULT_BOOKING_POLICY } from "../app/features/app-settings/booking-policy.ts";
import * as booking from "../app/features/programs/booking-policy.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function fixture(update = false) {
  const writes: any[] = [],
    current = {
      program_id: 7,
      duration_minutes: 50,
      booking_duration_minutes: [50, 90],
      max_capacity: 2,
    };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: current, error: null }),
  };
  const client = { from: () => chain };
  const deps: any = {
    "react-router": {
      data: (body: any, init: any) => ({ body, init }),
      redirect: (url: string) => ({ url }),
    },
    "~/core/lib/guards.server": { requireMethod: () => () => {} },
    "~/core/lib/supa-client.server": { default: () => [client, new Headers()] },
    "~/core/lib/supa-admin-client.server": { default: {} },
    "~/features/programs/booking-policy": booking,
    "../../guards.server": {
      requireAdminRole: async () => ({ organizationId: "org-a" }),
    },
    "../../lib/catalog-form.server": catalog,
    "~/features/programs/queries": {
      createProgram: async (_: unknown, row: any) => {
        writes.push(row);
        return { program_id: 7 };
      },
      updateProgram: async (_: unknown, row: any) => {
        writes.push(row.updates);
        return current;
      },
    },
    "~/features/app-settings/booking-policy.server": {
      getBookingPolicy: async () => DEFAULT_BOOKING_POLICY,
    },
    "~/features/app-settings/queries": {
      getMaxConcurrentStudents: async () => 7,
    },
  };
  const route = loadMockedModule<any>(
    new URL(
      `../app/features/admin/api/programs/${update ? "update" : "create"}.tsx`,
      import.meta.url,
    ),
    deps,
    { File },
  );
  return {
    writes,
    run: async (values: Record<string, string> = {}) => {
      const form = new FormData();
      for (const [k, v] of Object.entries({
        title: "검증",
        status: "ACTIVE",
        slug: "fixture",
        ...values,
      }))
        form.set(k, v);
      return route.action({
        request: new Request("https://lestly.test/api/admin/programs/create", {
          method: "POST",
          body: form,
        }),
        params: { programId: "7" },
      });
    },
  };
}
test("class create API copies organization defaults and allows explicitly supplied class rules", async () => {
  const f = fixture();
  assert.equal((await f.run()).url, "/admin/programs/7");
  assert.equal(f.writes[0].duration_minutes, 180);
  assert.deepEqual(f.writes[0].booking_duration_minutes, [180, 360, 540]);
  assert.equal(f.writes[0].max_capacity, 7);
  assert.equal(
    (
      await f.run({
        duration_minutes: "50",
        booking_duration_minutes: "[50,90]",
        max_capacity: "2",
      })
    ).url,
    "/admin/programs/7",
  );
  assert.equal(f.writes[1].max_capacity, 2);
  assert.deepEqual(f.writes[1].booking_duration_minutes, [50, 90]);
});
test("class update preserves own saved rules when a legacy form omits them and rejects malformed rules before writing", async () => {
  const f = fixture(true);
  assert.equal((await f.run()).url, "/admin/programs/7");
  assert.equal(f.writes[0].duration_minutes, 50);
  assert.deepEqual(f.writes[0].booking_duration_minutes, [50, 90]);
  assert.equal(f.writes[0].max_capacity, 2);
  const invalid: Record<string, string>[] = [
    { max_capacity: "101" },
    { duration_minutes: "1441" },
    { duration_minutes: "60", booking_duration_minutes: "[50,90]" },
    { booking_duration_minutes: "[50,50]" },
  ];
  for (const values of invalid)
    assert.equal((await f.run(values)).init.status, 400);
  assert.equal(f.writes.length, 1);
});
