import assert from "node:assert/strict";
import test from "node:test";

import { loadMockedModule } from "./helpers/mocked-module.ts";

function clientSetup({
  ios = false,
  standalone = true,
  disabled = false,
} = {}) {
  const operations: string[] = [];
  const keyBytes = Uint8Array.from({ length: 65 }, () => 4);
  const publicKey = Buffer.from(keyBytes).toString("base64url");
  const subscription = {
    options: { applicationServerKey: keyBytes.buffer },
    toJSON: () => ({
      endpoint: "https://web.push.apple.com/device",
      keys: { p256dh: publicKey, auth: "auth" },
    }),
    unsubscribe: async () => {
      operations.push("unsubscribe");
      return true;
    },
  };
  const registration = {
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => {
        operations.push("subscribe");
        return subscription;
      },
    },
  };
  const local = new Map<string, string>(
    disabled ? [["lestly.push.enabled", "false"]] : [],
  );
  const client = loadMockedModule<{
    pushSupport(): string;
    enableDevicePush(key: string): Promise<void>;
    disableDevicePush(): Promise<void>;
    syncExistingPushSubscription(): Promise<void>;
  }>(
    new URL("../app/features/notifications/push/client.ts", import.meta.url),
    {},
    {
      window: {
        isSecureContext: true,
        PushManager: {},
        Notification: {},
        matchMedia: () => ({ matches: standalone }),
      },
      navigator: {
        userAgent: ios ? "iPhone" : "Chrome Android",
        platform: "",
        maxTouchPoints: 0,
        serviceWorker: {
          getRegistration: async () => registration,
          register: async () => {
            operations.push("register");
            return registration;
          },
          ready: Promise.resolve(registration),
        },
      },
      Notification: {
        permission: "granted",
        requestPermission: async () => {
          operations.push("permission");
          return "granted";
        },
      },
      localStorage: {
        getItem: (key: string) => local.get(key),
        setItem: (key: string, value: string) => local.set(key, value),
      },
      atob,
      fetch: async (_url: string, options?: { method?: string }) => {
        operations.push(options?.method ?? "GET");
        return {
          ok: true,
          redirected: false,
          json: async () => ({ publicKey, configured: true, subscribed: true }),
        };
      },
    },
  );
  return { client, operations, publicKey, local };
}

test("iPhone requires Home Screen installation and permission is requested directly from the enable action", async () => {
  assert.equal(
    clientSetup({ ios: true, standalone: false }).client.pushSupport(),
    "install",
  );
  const state = clientSetup({ ios: true });
  assert.equal(state.client.pushSupport(), "supported");
  const enabling = state.client.enableDevicePush(state.publicKey);
  assert.deepEqual(state.operations, ["permission"]);
  await enabling;
  assert.deepEqual(state.operations, ["permission", "register", "POST"]);
  assert.equal(state.local.get("lestly.push.enabled"), "true");
});

test("explicit disable removes the server binding before unsubscribing and prevents silent re-enabling", async () => {
  const state = clientSetup();
  await state.client.disableDevicePush();
  assert.deepEqual(state.operations, ["DELETE", "unsubscribe"]);
  state.operations.length = 0;
  await state.client.syncExistingPushSubscription();
  assert.deepEqual(state.operations, []);
  const active = clientSetup();
  await active.client.syncExistingPushSubscription();
  assert.deepEqual(active.operations, ["GET", "POST"]);
  assert.equal(active.operations.includes("permission"), false);
});
