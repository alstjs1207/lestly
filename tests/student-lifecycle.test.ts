import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

import { getAuthenticatedProfile } from "../app/core/lib/authenticated-profile.server.ts";
import { getAuthUser } from "../app/core/lib/supa-client.server.ts";
import {
  changeStudentState,
  getStudentStateChangeImpact,
  parseStudentChangeImpact,
  studentLifecycleFailure,
} from "../app/features/admin/lib/student-lifecycle.server.ts";
import {
  DEFAULT_STUDENT_TYPES,
  studentTypeLabelMap,
} from "../app/features/organizations/student-types.ts";
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

test("restore requires an admin POST and uses the existing atomic NORMAL transition regardless of submitted fields", async () => {
  let code: string | undefined;
  let calls = 0;
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls++;
      assert.equal(name, "set_student_state");
      assert.deepEqual(args, {
        p_organization_id: "trusted-org",
        p_student_id: "student",
        p_state: "NORMAL",
        p_confirmation: null,
      });
      return { error: code ? { code } : null };
    },
  };
  const handler = loadMockedModule<{ action(args: unknown): Promise<any> }>(
    new URL("../app/features/admin/api/students/restore.tsx", import.meta.url),
    {
      "react-router": {
        data: (body: unknown, init: unknown) => ({ body, init }),
        redirect: (url: string) => ({ redirect: url }),
      },
      "~/core/lib/guards.server": {
        requireMethod: (method: string) => (request: Request) => {
          assert.equal(method, "POST");
          assert.equal(request.method, "POST");
        },
      },
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
  const submit = () =>
    handler.action({
      request: new Request("https://lestly.test/restore", {
        method: "POST",
        body: new URLSearchParams({
          state: "DELETED",
          organization_id: "forged",
        }),
      }),
      params: { studentId: "student" },
    });
  assert.equal((await submit()).redirect, "/admin/students/student");
  for (const [value, status] of [
    ["P0002", 404],
    ["42501", 403],
    ["unknown", 500],
  ] as const) {
    code = value;
    assert.equal((await submit()).init.status, status);
  }
  assert.equal(calls, 4);
});

test("student detail exposes graduate/withdraw only where eligible and restore only for inactive students", () => {
  const box = ({ children }: any) => React.createElement("div", null, children);
  const names = (keys: string) =>
    Object.fromEntries(keys.split(" ").map((k) => [k, box]));
  const Screen = loadMockedModule<{ default: React.ComponentType<any> }>(
    new URL(
      "../app/features/admin/screens/students/detail.tsx",
      import.meta.url,
    ),
    {
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "lucide-react": names(
        "CheckIcon ChevronLeftIcon ClipboardIcon EditIcon LinkIcon PhoneIcon",
      ),
      "react-router": { Link: box },
      "~/core/components/ui/badge": { Badge: box },
      "~/core/components/ui/button": { Button: box },
      "~/core/components/ui/card": names(
        "Card CardContent CardDescription CardHeader CardTitle",
      ),
      "~/core/components/ui/table": names(
        "Table TableBody TableCell TableHead TableHeader TableRow",
      ),
      "~/core/lib/supa-client.server": {},
      "../../../organizations/student-types": { studentTypeLabelMap },
      "../../../organizations/student-types.server": {},
      "../../components/student-invite-dialog": { default: box },
      "../../components/student-restore-dialog": {
        default: ({ withdrawn }: any) =>
          React.createElement(
            "button",
            null,
            withdrawn ? "탈퇴자 수강 재개" : "졸업생 수강 재개",
          ),
      },
      "../../components/student-state-dialog": {
        default: ({ kind }: any) =>
          React.createElement(
            "button",
            null,
            kind === "graduate" ? "수강 종료 처리" : "탈퇴 처리",
          ),
      },
      "../../components/student-total-hours": { StudentTotalHours: box },
      "../../guards.server": {},
      "../../lib/student-display": {},
      "../../queries": {},
      "../../utils/student-schedule-overview": {},
    },
  ).default;
  for (const state of ["NORMAL", "GRADUATE", "DELETED"]) {
    const html = renderToStaticMarkup(
      React.createElement(Screen, {
        loaderData: {
          studentTypes: DEFAULT_STUDENT_TYPES,
          student: {
            profile_id: "student",
            name: "학생",
            state,
            auth_user_id: "linked",
          },
          weeklySchedules: [],
          nextWeekSchedules: [],
          monthlySchedules: [],
          nextMonthSchedules: [],
        },
      }),
    );
    assert.equal(html.includes("수강 종료 처리"), state === "NORMAL");
    assert.equal(html.includes("탈퇴 처리"), state !== "DELETED");
    assert.equal(html.includes("수강 재개"), state !== "NORMAL");
    if (state === "DELETED") assert.ok(html.includes("탈퇴자 수강 재개"));
  }
});
