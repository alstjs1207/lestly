import assert from "node:assert/strict";
import test from "node:test";

import { getAuthenticatedProfile } from "../app/core/lib/authenticated-profile.server.ts";
import { getAuthUser } from "../app/core/lib/supa-client.server.ts";
import {
  changeStudentState,
  getStudentStateChangeImpact,
  parseStudentChangeImpact,
  studentLifecycleFailure,
} from "../app/features/admin/lib/student-lifecycle.server.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const confirmation = {
  cancel_count: 3,
  in_progress: false,
  requires_confirmation: true,
  token: "a".repeat(32),
};

test("student confirmation accepts only well-formed server impact and preserves pending changes", () => {
  assert.deepEqual(parseStudentChangeImpact(confirmation), confirmation);
  for (const value of [
    null,
    {},
    { ...confirmation, cancel_count: -1 },
    { ...confirmation, token: "bad" },
  ])
    assert.equal(parseStudentChangeImpact(value), null);
  assert.equal(
    studentLifecycleFailure({
      message: "student_change_confirmation_required",
      details: JSON.stringify(confirmation),
    })?.status,
    409,
  );
  assert.equal(
    studentLifecycleFailure({
      message: "student_change_confirmation_required",
      details: "invalid",
    }),
    null,
  );
  assert.equal(
    studentLifecycleFailure({ message: "student_lesson_in_progress" })?.status,
    409,
  );
});

function authClient(allowed: boolean, profile: unknown = null) {
  let calls = 0,
    signouts = 0;
  const client = {
    auth: {
      getClaims: async () => ({
        data: {
          claims: { sub: "auth-user", iat: 1700000000, aud: "authenticated" },
        },
        error: null,
      }),
      signOut: async (options: unknown) => {
        assert.deepEqual(options, { scope: "local" });
        signouts++;
      },
    },
    rpc: async () => {
      calls++;
      return { data: { allowed, profile }, error: null };
    },
    from() {
      throw new Error("Extra profile query forbidden");
    },
  };
  return { client, counts: () => ({ calls, signouts }) };
}

test("parallel loaders share one account check and the same verified profile without a second DB request", async () => {
  const profile = {
    profile_id: "student-id",
    auth_user_id: "auth-user",
    name: "Student",
  };
  const { client, counts } = authClient(true, profile);
  const [a, b] = await Promise.all([
    getAuthUser(client as never),
    getAuthUser(client as never),
  ]);
  assert.equal(a?.id, "auth-user");
  assert.equal(a, b);
  assert.equal(
    await getAuthenticatedProfile(client as never, "auth-user"),
    profile,
  );
  assert.deepEqual(counts(), { calls: 1, signouts: 0 });
});

test("revoked sessions clear cookies locally and never return an authenticated user", async () => {
  const { client, counts } = authClient(false);
  assert.equal(await getAuthUser(client as never), null);
  assert.equal(await getAuthUser(client as never), null);
  assert.deepEqual(counts(), { calls: 1, signouts: 1 });
});

test("account check storage failures fail closed instead of accepting a signed old JWT", async () => {
  const { client } = authClient(true);
  client.rpc = async () => {
    throw new Error("database offline");
  };
  await assert.rejects(getAuthUser(client as never), /database offline/);
});

for (const [route, state] of [
  ["graduate", "GRADUATE"],
  ["delete", "DELETED"],
]) {
  test(`${route} endpoint forwards explicit confirmation atomically and returns stale impact without redirecting`, async () => {
    let confirmed = false;
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        assert.equal(name, "set_student_state");
        assert.equal(args.p_state, state);
        assert.equal(args.p_organization_id, "trusted-org");
        confirmed = args.p_confirmation === confirmation.token;
        return {
          error: confirmed
            ? null
            : {
                message: "student_change_confirmation_required",
                details: JSON.stringify(confirmation),
              },
        };
      },
    };
    const handler = loadMockedModule<{ action(args: unknown): Promise<any> }>(
      new URL(
        `../app/features/admin/api/students/${route}.tsx`,
        import.meta.url,
      ),
      {
        "react-router": {
          data: (body: unknown, init: unknown) => ({ body, init }),
          redirect: (url: string) => ({ redirect: url }),
        },
        "~/core/lib/guards.server": { requireMethod: () => () => {} },
        "~/core/lib/supa-client.server": {
          default: () => [client, new Headers()],
        },
        "../../guards.server": {
          requireAdminRole: async () => ({ organizationId: "trusted-org" }),
        },
        "../../lib/student-lifecycle.server": {
          changeStudentState,
          studentLifecycleFailure,
        },
      },
    );
    const submit = (token = "") =>
      handler.action({
        params: { studentId: "student" },
        request: new Request("https://lestly.test/action", {
          method: "POST",
          body: new URLSearchParams({ lifecycle_confirmation: token }),
        }),
      });
    const first = await submit();
    assert.equal(first.init.status, 409);
    assert.equal(first.body.confirmation.cancel_count, 3);
    assert.equal(confirmed, false);
    assert.equal(
      (await submit(confirmation.token)).redirect,
      "/admin/students",
    );
    assert.equal(confirmed, true);
  });
}

for (const [route, state] of [
  ["graduate", "GRADUATE"],
  ["delete", "DELETED"],
]) {
  test(`${route} GET scopes the lookup, uses current end date, and never mutates state`, async () => {
    const filters: unknown[] = [];
    let rpcCalls = 0;
    const query = {
      select: (columns: string) => {
        assert.equal(columns, "profiles!inner(class_end_date)");
        return query;
      },
      eq: (key: string, value: string) => {
        filters.push([key, value]);
        return query;
      },
      maybeSingle: async () => ({
        data: { profiles: { class_end_date: "2027-01-01" } },
        error: null,
      }),
    };
    const client = {
      from: (table: string) => {
        assert.equal(table, "organization_members");
        return query;
      },
      rpc: async (name: string, args: unknown) => {
        rpcCalls++;
        assert.equal(name, "get_student_change_impact");
        assert.deepEqual(args, {
          p_organization_id: "trusted-org",
          p_student_id: "student",
          p_state: state,
          p_end: "2027-01-01",
        });
        return { data: confirmation, error: null };
      },
    };
    const handler = loadMockedModule<{ loader(args: unknown): Promise<any> }>(
      new URL(
        `../app/features/admin/api/students/${route}.tsx`,
        import.meta.url,
      ),
      {
        "react-router": {
          data: (body: unknown, init: unknown) => ({ body, init }),
        },
        "~/core/lib/guards.server": {},
        "~/core/lib/supa-client.server": {
          default: () => [client, new Headers()],
        },
        "../../guards.server": {
          requireAdminRole: async () => ({ organizationId: "trusted-org" }),
        },
        "../../lib/student-lifecycle.server": {
          getStudentStateChangeImpact,
          studentLifecycleFailure,
        },
      },
    );
    const result = await handler.loader({
      request: new Request("https://lestly.test/impact"),
      params: { studentId: "student" },
    });
    assert.deepEqual(result.body.impact, confirmation);
    assert.equal(result.init.headers.get("Cache-Control"), "private, no-store");
    assert.equal(rpcCalls, 1);
    assert.deepEqual(filters, [
      ["organization_id", "trusted-org"],
      ["profile_id", "student"],
      ["role", "STUDENT"],
    ]);
    query.maybeSingle = async () => ({ data: null, error: null }) as never;
    const missing = await handler.loader({
      request: new Request("https://lestly.test/impact"),
      params: { studentId: "student" },
    });
    assert.equal(missing.init.status, 404);
    assert.equal(rpcCalls, 1);
  });
}
