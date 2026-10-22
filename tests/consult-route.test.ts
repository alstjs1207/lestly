import assert from "node:assert/strict";
import test from "node:test";

import { requireMethod } from "../app/core/lib/guards.server.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

test("consultation is disabled before any parsing or privileged DB access", async () => {
  const route = loadMockedModule<{
    action(args: {
      request: Request;
    }): Promise<{
      data: unknown;
      init: { status: number; headers: Record<string, string> };
    }>;
  }>(
    new URL("../app/features/class/api/consult-request.tsx", import.meta.url),
    {
      "react-router": {
        data: (data: unknown, init: unknown) => ({ data, init }),
      },
      "~/core/lib/guards.server": { requireMethod },
    },
  );
  for (const body of [
    "invalid JSON",
    JSON.stringify({ programId: 12, name: "Test", phone: "01012345678" }),
  ]) {
    const response = await route.action({
      request: new Request("https://lestly.test/api/consult-request", {
        method: "POST",
        body,
      }),
    });
    assert.equal(response.init.status, 503);
    assert.equal(response.init.headers["Cache-Control"], "no-store");
  }
  await assert.rejects(
    route.action({
      request: new Request("https://lestly.test/api/consult-request", {
        method: "POST",
        headers: { Origin: "https://evil.test" },
      }),
    }),
  );
});
