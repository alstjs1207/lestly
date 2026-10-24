import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";

import {
  isAllowedPushEndpoint,
  pushSubscriptionSchema,
} from "../app/features/notifications/push/validation.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

function setup({
  configured = true,
  eligible = true,
  status = 0,
  attempts = 1,
  persistFailure = false,
} = {}) {
  const sent: unknown[] = [];
  const finished: { status: string; error: string | null }[] = [];
  const removed: string[] = [];
  const captured: string[] = [];
  let claims = 0;
  const dispatcher = loadMockedModule<{
    dispatchPushQueue(): Promise<{ configured: boolean; processed: number }>;
    dispatchSchedulePush(id: number, actor: string): Promise<void>;
  }>(
    new URL(
      "../app/features/notifications/push/dispatch.server.ts",
      import.meta.url,
    ),
    {
      "@sentry/react-router": {
        captureMessage: (message: string) => captured.push(message),
      },
      "web-push": {
        default: {
          sendNotification: async (...args: unknown[]) => {
            sent.push(args);
            if (status)
              throw {
                statusCode: status,
                body: "sensitive endpoint and payload must not be logged",
              };
          },
        },
      },
      "./config.server": {
        getPushConfig: () =>
          configured
            ? {
                publicKey: "public",
                privateKey: "private",
                subject: "mailto:ops@lestly.test",
              }
            : null,
      },
      "./validation": { isAllowedPushEndpoint },
      "./store.server": {
        claimPushDeliveries: async () => {
          claims++;
          return [{ delivery_id: "delivery", claim_token: "lease", attempts }];
        },
        getPushDeliveryTarget: async () => ({
          eligible,
          endpoint: "https://fcm.googleapis.com/fcm/send/device",
          subscription_id: "subscription",
          p256dh: "key",
          auth: "auth",
          event_id: "event",
          title: "수업 예약",
          body: "수강생이 예약했습니다.",
        }),
        finishPushDelivery: async (
          _delivery: unknown,
          status: string,
          error: string | null = null,
        ) => {
          if (persistFailure) throw new Error("database unavailable");
          finished.push({ status, error });
        },
        removeExpiredPushSubscription: async (id: string) => {
          removed.push(id);
        },
        maintainPushQueue: async () => {},
      },
    },
  );
  return {
    dispatcher,
    sent,
    finished,
    removed,
    captured,
    claims: () => claims,
  };
}

test("Web Push validates browser endpoints and refuses SSRF, credentials, bad keys and invalid expirations", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/device",
    "https://web.push.apple.com/Q/device",
    "https://updates.push.services.mozilla.com/wpush/v2/device",
  ])
    assert.equal(isAllowedPushEndpoint(endpoint), true);
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/x",
    "https://127.0.0.1/secret",
    "https://fcm.googleapis.com.attacker.test/fcm/send/x",
    "https://attacker.test/?host=push.apple.com",
    "https://user:pass@web.push.apple.com/device",
    "https://fcm.googleapis.com:8080/fcm/send/x",
    "https://web.push.apple.com/device#secret",
    "file:///etc/passwd",
  ])
    assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  const subscription = {
    endpoint: "https://web.push.apple.com/device",
    keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
  };
  assert.equal(pushSubscriptionSchema.safeParse(subscription).success, true);
  assert.equal(
    pushSubscriptionSchema.safeParse({ ...subscription, expirationTime: 1e20 })
      .success,
    false,
  );
  assert.equal(
    pushSubscriptionSchema.safeParse({
      ...subscription,
      keys: { auth: "bad", p256dh: "bad" },
    }).success,
    false,
  );
});

test("Web Push never sends when unconfigured or recipient permissions have changed", async () => {
  const disabled = setup({ configured: false });
  assert.equal(
    (await disabled.dispatcher.dispatchPushQueue()).configured,
    false,
  );
  assert.equal(disabled.claims(), 0);
  const revoked = setup({ eligible: false });
  await revoked.dispatcher.dispatchPushQueue();
  assert.equal(revoked.sent.length, 0);
  assert.equal(revoked.finished[0].status, "SKIPPED");
});

test("Web Push sends visible notifications with a stable event tag and persists acceptance", async () => {
  const state = setup();
  await state.dispatcher.dispatchPushQueue();
  const [, payload, options] = state.sent[0] as [
    unknown,
    string,
    { timeout: number; TTL: number },
  ];
  assert.equal(JSON.parse(payload).tag, "schedule-event");
  assert.equal(JSON.parse(payload).url, "/admin/schedules");
  assert.equal(options.timeout, 4000);
  assert.equal(options.TTL, 3600);
  assert.equal(state.finished[0].status, "SENT");
});

test("Web Push deletes gone subscriptions, retries transient errors and stops permanent/exhausted failures", async () => {
  for (const status of [404, 410]) {
    const state = setup({ status });
    await state.dispatcher.dispatchPushQueue();
    assert.deepEqual(state.removed, ["subscription"]);
    assert.equal(state.finished.length, 0);
  }
  for (const status of [408, 429, 500, 503]) {
    const state = setup({ status });
    await state.dispatcher.dispatchPushQueue();
    assert.equal(state.finished[0].status, "PENDING");
    assert.equal(state.finished[0].error, `push_http_${status}`);
  }
  for (const status of [400, 401, 403]) {
    const state = setup({ status });
    await state.dispatcher.dispatchPushQueue();
    assert.equal(state.finished[0].status, "FAILED");
  }
  const exhausted = setup({ status: 503, attempts: 5 });
  await exhausted.dispatcher.dispatchPushQueue();
  assert.equal(exhausted.finished[0].status, "FAILED");
});

test("a DB failure after push acceptance leaves the lease intact and never fails a committed booking", async () => {
  const state = setup({ persistFailure: true });
  await state.dispatcher.dispatchSchedulePush(12, "student");
  assert.equal(state.sent.length, 1);
  assert.equal(state.finished.length, 0);
  assert.deepEqual(state.captured, [
    "Immediate Web Push failed; queued for retry",
  ]);
});

test("the push worker displays a notification and opens only the authenticated same-origin schedule page", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const notifications: any[] = [];
  const navigated: string[] = [];
  let focused = false;
  let waiting: Promise<unknown> = Promise.resolve();
  const worker = {
    addEventListener: (name: string, handler: (event: any) => void) => {
      handlers[name] = handler;
    },
    registration: {
      showNotification: async (...args: any[]) => {
        notifications.push(args);
      },
    },
    location: { origin: "https://lestly.test" },
    clients: {
      matchAll: async () => [
        {
          url: "https://lestly.test/admin",
          navigate: async (url: string) => {
            navigated.push(url);
          },
          focus: () => {
            focused = true;
          },
        },
      ],
      openWindow: async (url: string) => {
        navigated.push(url);
      },
    },
  };
  new Script(
    readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"),
  ).runInNewContext({ self: worker, URL });
  handlers.push({
    data: {
      json: () => ({
        title: "예약",
        body: "수업 예약",
        url: "https://attacker.test",
        tag: "event",
      }),
    },
    waitUntil: (promise: Promise<unknown>) => {
      waiting = promise;
    },
  });
  await waiting;
  assert.equal(notifications[0][0], "예약");
  assert.equal(notifications[0][1].tag, "event");
  handlers.push({
    data: {
      json: () => {
        throw new Error("malformed");
      },
    },
    waitUntil: (promise: Promise<unknown>) => {
      waiting = promise;
    },
  });
  await waiting;
  assert.equal(notifications[1][0], "Lestly 새 알림");
  handlers.notificationclick({
    notification: { close() {} },
    waitUntil: (promise: Promise<unknown>) => {
      waiting = promise;
    },
  });
  await waiting;
  assert.deepEqual(navigated, ["https://lestly.test/admin/schedules"]);
  assert.equal(focused, true);
});
