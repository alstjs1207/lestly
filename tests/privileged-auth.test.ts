import assert from "node:assert/strict";
import test from "node:test";

import { getCurrentPrivilegedUser } from "../app/core/lib/privileged-auth.server.ts";

test("privileged authorization uses current Auth metadata instead of stale JWT roles", async () => {
  let calls = 0;
  const currentUser = { id: "former-admin", app_metadata: { role: "user" } };
  const client = {
    rpc: async () => ({ data: { allowed: true, profile: null }, error: null }),
    auth: {
      getClaims: async () => ({
        data: { claims: { app_metadata: { role: "super_admin" } } },
      }),
      getUser: async () => {
        calls += 1;
        return { data: { user: currentUser }, error: null };
      },
    },
  };
  const [first, second] = await Promise.all([
    getCurrentPrivilegedUser(client as never),
    getCurrentPrivilegedUser(client as never),
  ]);
  assert.equal(first?.app_metadata.role, "user");
  assert.equal(second, first);
  assert.equal(calls, 2);
});

test("privileged authorization fails closed when Auth verification fails", async () => {
  const client = {
    rpc: async () => ({ data: { allowed: true, profile: null }, error: null }),
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error("Auth unavailable"),
      }),
    },
  };
  assert.equal(await getCurrentPrivilegedUser(client as never), null);
});
