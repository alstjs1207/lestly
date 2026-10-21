import assert from "node:assert/strict";
import test from "node:test";

import { requireSameOrigin } from "../app/core/lib/guards.server.ts";
import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

type Result = { data: unknown; init?: { status?: number } };
type Route = { action(args: { request: Request }): Promise<Result> };

function setup(authorized = true) {
  const updates: Array<Record<string, unknown>> = [];
  const filters: Array<[string, unknown]> = [];
  let guardCalls = 0;
  const chain = {
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return chain;
    },
    then(resolve: (value: { error: null }) => unknown) {
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
  const client = {
    from(table: string) {
      assert.equal(table, "in_app_notifications");
      return {
        update(values: Record<string, unknown>) {
          updates.push(values);
          return chain;
        },
      };
    },
  };
  const route = loadMockedModule<Route>(
    new URL(
      "../app/features/notifications/api/in-app-notifications.tsx",
      import.meta.url,
    ),
    {
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
      },
      "~/core/lib/guards.server": { requireSameOrigin },
      "~/core/lib/request-body": { readBoundedJson, RequestBodyError },
      "~/core/lib/supa-client.server": {
        default: () => [client, new Headers()],
      },
      "~/features/admin/guards.server": {
        requireAdminRole: async () => {
          guardCalls += 1;
          if (!authorized) throw new Response(null, { status: 403 });
          return {
            organizationId: "authorized-org",
            profileId: "stable-profile",
            user: { id: "login-id" },
          };
        },
        requireNotificationsEnabled: async () => {},
      },
    },
  );
  return {
    route,
    updates,
    filters,
    get guardCalls() {
      return guardCalls;
    },
  };
}

function request(
  method: string,
  body: unknown,
  origin = "https://lestly.test",
) {
  return new Request("https://lestly.test/api/notifications", {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

test("notification route blocks unsupported methods, foreign origins, and unauthorized users before writes", async () => {
  const state = setup();
  assert.equal(
    (await state.route.action({ request: request("DELETE", {}) })).init?.status,
    405,
  );
  await assert.rejects(
    state.route.action({
      request: request(
        "PATCH",
        { in_app_notification_id: 1 },
        "https://evil.test",
      ),
    }),
  );
  assert.equal(state.guardCalls, 0);
  assert.equal(state.updates.length, 0);
  const denied = setup(false);
  await assert.rejects(
    denied.route.action({
      request: request("PATCH", { in_app_notification_id: 1 }),
    }),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
  assert.equal(denied.updates.length, 0);
});

test("notification PATCH rejects malformed IDs and scopes stable profile attribution to its tenant", async () => {
  const state = setup();
  for (const id of [undefined, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      (
        await state.route.action({
          request: request("PATCH", { in_app_notification_id: id }),
        })
      ).init?.status,
      400,
    );
  }
  assert.equal(state.updates.length, 0);
  await state.route.action({
    request: request("PATCH", {
      in_app_notification_id: 12,
      organization_id: "attacker-org",
    }),
  });
  assert.equal(state.updates[0].read_by, "stable-profile");
  assert.deepEqual(state.filters, [
    ["in_app_notification_id", 12],
    ["organization_id", "authorized-org"],
  ]);
});

test("notification POST marks only its own tenant unread rows and uses stable profile identity", async () => {
  const state = setup();
  await state.route.action({ request: request("POST", {}) });
  assert.equal(state.updates[0].read_by, "stable-profile");
  assert.deepEqual(state.filters, [
    ["organization_id", "authorized-org"],
    ["is_read", false],
  ]);
});
