import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as net from "node:net";
import test from "node:test";

import { loadMockedModule } from "./helpers/mocked-module.ts";

function setup(env: Record<string, string> = {}) {
  return loadMockedModule<{
    consultClientIp(request: Request): string | null;
    consultHash(secret: string, kind: string, value: string): string;
    getConsultConfig(): unknown;
  }>(
    new URL(
      "../app/features/class/consult-security.server.ts",
      import.meta.url,
    ),
    { "node:crypto": crypto, "node:net": net },
    {
      process: { env },
    },
  );
}

test("consult IP budgets trust only the deployed edge header and fail closed outside configured production hosting", () => {
  const request = (headers: Record<string, string>) =>
    new Request("https://lestly.test", { headers });
  const hosted = setup({ VERCEL: "1", NODE_ENV: "production" });
  assert.equal(
    hosted.consultClientIp(request({ "x-forwarded-for": "192.0.2.1" })),
    null,
  );
  assert.equal(
    hosted.consultClientIp(
      request({
        "x-vercel-forwarded-for": "192.0.2.5",
        "x-forwarded-for": "192.0.2.1",
      }),
    ),
    "192.0.2.5",
  );
  assert.equal(
    hosted.consultClientIp(request({ "x-vercel-forwarded-for": "invalid" })),
    null,
  );
  assert.equal(
    setup({ NODE_ENV: "production" }).consultClientIp(
      request({ "x-vercel-forwarded-for": "192.0.2.5" }),
    ),
    null,
  );
  assert.equal(setup().consultClientIp(request({})), "local");
});

test("consult needs only a strong HMAC secret and hashes use separate IP/phone domains", () => {
  const s = setup();
  assert.equal(s.getConsultConfig(), null);
  assert.equal(
    setup({ CONSULT_RATE_LIMIT_SECRET: "short" }).getConsultConfig(),
    null,
  );
  assert.match(
    s.consultHash("s".repeat(32), "ip", "192.0.2.1"),
    /^[a-f0-9]{64}$/,
  );
  assert.notEqual(
    s.consultHash("secret", "ip", "same"),
    s.consultHash("secret", "phone", "same"),
  );
  assert.notEqual(
    s.consultHash("secret", "ip", "same"),
    s.consultHash("rotated", "ip", "same"),
  );
  assert.ok(
    setup({
      CONSULT_RATE_LIMIT_SECRET: "s".repeat(32),
    }).getConsultConfig(),
  );
});
