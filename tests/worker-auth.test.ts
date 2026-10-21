import assert from "node:assert/strict";
import test from "node:test";

import { isWorkerAuthorized } from "../supabase/functions/_shared/worker-auth.ts";

const request = (authorization?: string) =>
  new Request("https://lestly.test/worker", {
    headers: authorization ? { Authorization: authorization } : {},
  });

test("workers fail closed on missing configuration or credentials", () => {
  assert.equal(isWorkerAuthorized(request(), undefined), false);
  assert.equal(
    isWorkerAuthorized(request("Bearer undefined"), undefined, true),
    false,
  );
  assert.equal(isWorkerAuthorized(request(), ""), false);
  assert.equal(isWorkerAuthorized(request("secret"), "   "), false);
  assert.equal(isWorkerAuthorized(request("secRet"), "secret"), false);
});

test("cron retains raw secrets while Edge requires service-role Bearer credentials", () => {
  assert.equal(isWorkerAuthorized(request("secret"), "secret"), true);
  assert.equal(
    isWorkerAuthorized(request("Bearer secret"), "secret", true),
    true,
  );
  assert.equal(isWorkerAuthorized(request("secret"), "secret", true), false);
  assert.equal(
    isWorkerAuthorized(request("Bearer anon-key"), "service-role", true),
    false,
  );
});
