import assert from "node:assert/strict";
import test from "node:test";

import {
  requireMethod,
  requireSameOrigin,
} from "../app/core/lib/guards.server.ts";
import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import { pushSubscriptionSchema } from "../app/features/notifications/push/validation.ts";
import { isWorkerAuthorized } from "../supabase/functions/_shared/worker-auth.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function subscriptionRoute(authorized = true, configured = true) {
  const saved: unknown[][] = [];
  const removed: string[] = [];
  let guardCalls = 0;
  const route = loadMockedModule<{
    action(args: any): Promise<any>;
    loader(args: any): Promise<any>;
  }>(
    new URL(
      "../app/features/notifications/api/push-subscription.tsx",
      import.meta.url,
    ),
    {
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
      },
      "~/core/lib/guards.server": { requireSameOrigin },
      "~/core/lib/request-body": { readBoundedJson, RequestBodyError },
      "~/core/lib/supa-client.server": { default: () => [{}, new Headers()] },
      "~/features/admin/guards.server": {
        requireAdminRole: async () => {
          guardCalls++;
          if (!authorized) throw new Response(null, { status: 403 });
          return { organizationId: "server-org", profileId: "server-profile" };
        },
      },
      "../push/config.server": {
        getPushConfig: () =>
          configured
            ? { publicKey: "public", privateKey: "secret", subject: "subject" }
            : null,
      },
      "../push/device.server": {
        ensurePushDeviceId: async () => "server-device",
        getPushDeviceId: async () => "server-device",
      },
      "../push/store.server": {
        savePushSubscription: async (...args: unknown[]) => {
          saved.push(args);
        },
        removePushDevice: async (id: string) => {
          removed.push(id);
        },
        hasPushSubscription: async () => true,
      },
      "../push/validation": { pushSubscriptionSchema },
    },
  );
  return { route, saved, removed, guardCalls: () => guardCalls };
}

const subscription = {
  endpoint: "https://web.push.apple.com/device",
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
};
const request = (
  method: string,
  body: unknown = subscription,
  origin = "https://lestly.test",
) =>
  new Request("https://lestly.test/api/notifications/push-subscription", {
    method,
    headers: { "Content-Type": "application/json", Origin: origin },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });

test("push subscription routes reject foreign origins, unsupported methods and unauthorized accounts before writes", async () => {
  const state = subscriptionRoute();
  assert.equal(
    (await state.route.action({ request: request("PATCH") })).init.status,
    405,
  );
  await assert.rejects(
    state.route.action({
      request: request("POST", subscription, "https://attacker.test"),
    }),
  );
  assert.equal(state.guardCalls(), 0);
  const forbidden = subscriptionRoute(false);
  await assert.rejects(forbidden.route.action({ request: request("POST") }));
  assert.equal(forbidden.saved.length, 0);
  await assert.rejects(forbidden.route.action({ request: request("DELETE") }));
  assert.equal(forbidden.removed.length, 0);
});

test("push registration always uses server identity/device and never reveals VAPID private keys", async () => {
  const state = subscriptionRoute();
  const response = await state.route.action({
    request: request("POST", {
      ...subscription,
      organization_id: "attacker-org",
      profile_id: "victim",
      device_id: "other-device",
    }),
  });
  assert.equal(response.data.success, true);
  assert.deepEqual(state.saved[0].slice(0, 3), [
    "server-org",
    "server-profile",
    "server-device",
  ]);
  assert.deepEqual(state.saved[0][3], subscription);
  const settings = await state.route.loader({
    request: new Request(
      "https://lestly.test/api/notifications/push-subscription",
    ),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(settings.data)), {
    configured: true,
    publicKey: "public",
    subscribed: true,
  });
  assert.equal(settings.init.headers.get("Cache-Control"), "no-store");
  await state.route.action({ request: request("DELETE") });
  assert.deepEqual(state.removed, ["server-device"]);
});

test("push registration rejects malformed/oversized payloads and unconfigured delivery", async () => {
  const state = subscriptionRoute();
  assert.equal(
    (
      await state.route.action({
        request: request("POST", {
          ...subscription,
          endpoint: "https://127.0.0.1/private",
        }),
      })
    ).init.status,
    400,
  );
  assert.equal(
    (
      await state.route.action({
        request: request("POST", { padding: "x".repeat(9000) }),
      })
    ).init.status,
    413,
  );
  assert.equal(state.saved.length, 0);
  const disabled = subscriptionRoute(true, false);
  assert.equal(
    (await disabled.route.action({ request: request("POST") })).init.status,
    503,
  );
  assert.equal(disabled.saved.length, 0);
});

test("push retry worker requires a configured secret and never runs for ordinary requests", async () => {
  let processed = 0;
  const route = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL("../app/features/notifications/api/push-cron.tsx", import.meta.url),
    {
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
      },
      "~/core/lib/worker-auth.server": { isWorkerAuthorized },
      "../push/dispatch.server": {
        dispatchPushQueue: async () => {
          processed++;
          return { configured: true, processed: 1 };
        },
      },
    },
    { process: { env: { CRON_SECRET: "worker-secret" } } },
  );
  for (const headers of [
    new Headers(),
    new Headers({ Authorization: "public-key" }),
  ]) {
    assert.equal(
      (
        await route.action({
          request: new Request("https://lestly.test/api/cron/push", {
            method: "POST",
            headers,
          }),
        })
      ).init.status,
      401,
    );
  }
  assert.equal(processed, 0);
  assert.equal(
    (
      await route.action({
        request: new Request("https://lestly.test/api/cron/push", {
          method: "POST",
          headers: { Authorization: "worker-secret" },
        }),
      })
    ).data.processed,
    1,
  );
});

test("logout detaches only this device before signout and keeps the session if detachment fails", async () => {
  const operations: string[] = [];
  let failCleanup = false;
  const route = loadMockedModule<{ action(args: any): Promise<any> }>(
    new URL("../app/features/auth/screens/logout.tsx", import.meta.url),
    {
      "react-router": { redirect: (url: string) => ({ url }) },
      "~/core/lib/guards.server": { requireMethod },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            auth: {
              signOut: async () => {
                operations.push("signout");
              },
            },
          },
          new Headers(),
        ],
      },
      "~/features/notifications/push/device.server": {
        getPushDeviceId: async () => "this-device",
        clearPushDeviceCookie: async () => {
          operations.push("clear-cookie");
        },
      },
      "~/features/notifications/push/store.server": {
        removePushDevice: async (id: string) => {
          operations.push(id);
          if (failCleanup) throw new Error("database unavailable");
        },
      },
    },
  );
  await route.action({
    request: new Request("https://lestly.test/logout", { method: "POST" }),
  });
  assert.deepEqual(operations, ["this-device", "clear-cookie", "signout"]);
  operations.length = 0;
  failCleanup = true;
  await assert.rejects(
    route.action({
      request: new Request("https://lestly.test/logout", { method: "POST" }),
    }),
  );
  assert.deepEqual(operations, ["this-device"]);
});
