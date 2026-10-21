import type { ReactNode } from "react";

import { createReadableStreamFromReadable } from "@react-router/node";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { renderToPipeableStream } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

import { loadMockedModule } from "./helpers/mocked-module.ts";

type ServerEntry = {
  default(
    request: Request,
    status: number,
    headers: Headers,
    context: object,
    loadContext: object,
  ): Promise<Response>;
};

function setup(initFailure?: Error) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const i18n = {
    use() {
      return i18n;
    },
    init: async () => {
      if (initFailure) throw initFailure;
    },
  };
  const entry = loadMockedModule<ServerEntry>(
    new URL("../app/entry.server.tsx", import.meta.url),
    {
      "react/jsx-runtime": jsxRuntime,
      "@react-router/node": { createReadableStreamFromReadable },
      "@sentry/node": { captureException() {} },
      i18next: { createInstance: () => i18n },
      isbot: { isbot: () => false },
      "node:stream": { PassThrough },
      "react-dom/server": { renderToPipeableStream },
      "react-i18next": {
        I18nextProvider: ({ children }: { children: ReactNode }) => children,
        initReactI18next: {},
      },
      "react-router": {
        ServerRouter: () =>
          jsxRuntime.jsx("main", { children: "Server rendered page" }),
      },
      "./core/lib/i18next.server": {
        default: {
          getLocale: async () => "ko",
          getRouteNamespaces: () => ["common"],
        },
      },
      "./i18n": { default: {} },
      "./locales/en": { default: {} },
      "./locales/es": { default: {} },
      "./locales/ko": { default: {} },
    },
    {
      process: { env: { NODE_ENV: "production" } },
      setTimeout(callback: () => void, delay: number) {
        const timer = setTimeout(callback, delay);
        timers.add(timer);
        return timer;
      },
      clearTimeout(timer: ReturnType<typeof setTimeout>) {
        timers.delete(timer);
        clearTimeout(timer);
      },
    },
  );
  return {
    entry,
    timers,
    cleanup() {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}

test("real SSR stream completes with security headers and releases its abort timer", async () => {
  const state = setup();
  try {
    const response = await state.entry.default(
      new Request("https://lestly.test"),
      200,
      new Headers(),
      { isSpaMode: false },
      {},
    );
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Server rendered page/);
    assert.match(
      response.headers.get("Content-Security-Policy")!,
      /frame-ancestors 'none'/,
    );
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    await nextTurn();
    assert.equal(state.timers.size, 0);
  } finally {
    state.cleanup();
  }
});

test("SSR initialization errors reject the response instead of leaving a pending promise", async () => {
  const state = setup(new Error("i18n initialization failed"));
  try {
    await assert.rejects(
      state.entry.default(
        new Request("https://lestly.test"),
        200,
        new Headers(),
        {},
        {},
      ),
      /i18n initialization failed/,
    );
    assert.equal(state.timers.size, 0);
  } finally {
    state.cleanup();
  }
});

test("pre-aborted SSR requests reject and release their render timeout", async () => {
  const state = setup();
  const controller = new AbortController();
  controller.abort(new Error("client disconnected"));
  try {
    await assert.rejects(
      state.entry.default(
        new Request("https://lestly.test", { signal: controller.signal }),
        200,
        new Headers(),
        {},
        {},
      ),
      /aborted|client disconnected/,
    );
    await nextTurn();
    assert.equal(state.timers.size, 0);
  } finally {
    state.cleanup();
  }
});
