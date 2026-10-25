import assert from "node:assert/strict";
import test from "node:test";

import { getSessionUser } from "../app/core/lib/supa-client.server.ts";

test("legacy session helper uses a locally verified asymmetric JWT", async () => {
  let getUserCalls = 0;
  const expectedUser = { id: "verified-user" };
  const client = {
    rpc: async () => ({ data: { allowed: true, profile: null }, error: null }),
    auth: {
      getClaims: async () => ({
        data: {
          claims: {
            sub: expectedUser.id,
            aud: "authenticated",
            role: "authenticated",
            iat: 1_700_000_000,
            email: "admin@example.com",
            app_metadata: {},
            user_metadata: { name: "Admin" },
          },
        },
        error: null,
      }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: expectedUser } };
      },
    },
  };

  const user = await getSessionUser(client as never);

  assert.equal(user?.id, expectedUser.id);
  assert.equal(user?.email, "admin@example.com");
  assert.equal(user?.user_metadata.name, "Admin");
  assert.equal(getUserCalls, 0);
});

test("auth helper falls back to auth.getUser when claims cannot be verified", async () => {
  let getUserCalls = 0;
  const expectedUser = { id: "fallback-user" };
  const client = {
    rpc: async () => ({ data: { allowed: true, profile: null }, error: null }),
    auth: {
      getClaims: async () => ({ data: null, error: new Error("no jwks") }),
      getUser: async () => {
        getUserCalls += 1;
        return { data: { user: expectedUser } };
      },
    },
  };

  const user = await getSessionUser(client as never);

  assert.equal(user?.id, expectedUser.id);
  assert.equal(getUserCalls, 1);
});
