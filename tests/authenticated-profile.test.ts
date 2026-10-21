import assert from "node:assert/strict";
import test from "node:test";

import { getAuthenticatedProfile } from "../app/core/lib/authenticated-profile.server.ts";

test("auth login identity resolves to a different stable profile and reuses the request lookup", async () => {
  const profile = { profile_id: "student-profile", auth_user_id: "login-user" };
  const filters: Array<[string, string]> = [];
  let queries = 0;
  const client = {
    from(table: string) {
      assert.equal(table, "profiles");
      queries += 1;
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            filters.push([column, value]);
            return {
              maybeSingle: async () => ({ data: profile, error: null }),
            };
          },
        }),
      };
    },
  };

  const [first, second] = await Promise.all([
    getAuthenticatedProfile(client as never, "login-user"),
    getAuthenticatedProfile(client as never, "login-user"),
  ]);
  assert.equal(first?.profile_id, "student-profile");
  assert.equal(second, first);
  assert.equal(queries, 1);
  assert.deepEqual(filters, [["auth_user_id", "login-user"]]);
});

test("missing and failed profile lookups never assume the auth ID is a profile ID", async () => {
  const makeClient = (error: Error | null) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error }) }),
      }),
    }),
  });
  assert.equal(
    await getAuthenticatedProfile(makeClient(null) as never, "unknown-user"),
    null,
  );
  await assert.rejects(
    getAuthenticatedProfile(
      makeClient(new Error("lookup failed")) as never,
      "unknown-user",
    ),
    /lookup failed/,
  );
});
