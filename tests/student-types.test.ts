import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import {
  parseBulkStudents,
  parseStudentClipboard,
} from "../app/features/admin/lib/student-bulk.ts";
import { parseStudentForm } from "../app/features/admin/lib/student-form.server.ts";
import {
  parseStudentTypePolicy,
  studentTypePolicyFailure,
} from "../app/features/organizations/student-type-policy.ts";
import { getStudentTypes } from "../app/features/organizations/student-types.server.ts";
import {
  DEFAULT_STUDENT_TYPES,
  getDefaultStudentType,
  studentTypeLabelMap,
} from "../app/features/organizations/student-types.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const custom = [
  {
    code: "TYPE_CHILD",
    label: "어린이",
    sort_order: 0,
    is_active: true,
    is_default: true,
  },
  {
    ...DEFAULT_STUDENT_TYPES[0],
    label: "청소년",
    sort_order: 1,
    is_active: false,
    is_default: false,
  },
  { ...DEFAULT_STUDENT_TYPES[1], sort_order: 2 },
];
test("organization policy requires distinct names, order, active choices and one active default", () => {
  assert.equal(
    parseStudentTypePolicy({ types: custom, expected: DEFAULT_STUDENT_TYPES })
      .success,
    true,
  );
  for (const types of [
    [],
    custom.map((t) => ({ ...t, is_active: false, is_default: false })),
    custom.map((t) => ({ ...t, is_default: false })),
    custom.map((t) => ({ ...t, is_default: true })),
    custom.map((t) => ({ ...t, label: "중복" })),
    custom.map((t) => ({ ...t, sort_order: 0 })),
    [{ ...custom[0], label: " " }, ...custom.slice(1)],
  ]) {
    assert.equal(
      parseStudentTypePolicy({ types, expected: DEFAULT_STUDENT_TYPES })
        .success,
      false,
    );
  }
  assert.equal(
    parseStudentTypePolicy({
      types: [
        { ...custom[0], is_default: false },
        { ...custom[1], is_default: true },
        custom[2],
      ],
      expected: DEFAULT_STUDENT_TYPES,
    }).success,
    false,
  );
});
test("organization defaults and renamed labels drive clipboard and bulk validation", () => {
  assert.equal(getDefaultStudentType(custom), "TYPE_CHILD");
  assert.equal(studentTypeLabelMap(custom).STUDENT, "청소년");
  const rows = parseStudentClipboard(
    "김하나\t01012345678\t\n김둘\t01012345679\t서울\t성인",
    custom,
  );
  assert.deepEqual(
    rows.map((r) => r.type),
    ["TYPE_CHILD", "ADULT"],
  );
  assert.equal(
    parseStudentClipboard("김하나\t01012345678\t\t어린이", custom)[0].type,
    "TYPE_CHILD",
  );
  const inactive = parseStudentClipboard(
    "김하나\t01012345678\t\t청소년",
    custom,
  );
  assert.equal(inactive[0].type, "STUDENT");
  assert.equal(
    parseBulkStudents(
      inactive.map((r) => ({ ...r, id: "0" })),
      custom,
    ).success,
    false,
  );
  assert.equal(
    parseBulkStudents(
      rows.map((r, id) => ({ ...r, id: String(id) })),
      custom,
    ).success,
    true,
  );
});
test("existing students can retain their inactive type but new/foreign assignments are rejected", () => {
  const form = new FormData();
  Object.entries({
    name: "학생",
    phone: "01012345678",
    type: "STUDENT",
    color: "#3B82F6",
  }).forEach(([k, v]) => form.set(k, v));
  assert.equal(parseStudentForm(form, custom).success, false);
  assert.equal(parseStudentForm(form, custom, "STUDENT").success, true);
  assert.equal(parseStudentForm(form, custom, "ADULT").success, false);
  form.set("type", "TYPE_FOREIGN");
  assert.equal(parseStudentForm(form, custom, "STUDENT").success, false);
  form.set("type", "TYPE_CHILD");
  assert.equal(parseStudentForm(form, custom).success, true);
});
test("catalog queries scope the organization, preserve order and fail on errors", async () => {
  const calls: unknown[] = [];
  let error: unknown = null;
  const query = {
    select(v: string) {
      calls.push(v);
      return this;
    },
    eq(k: string, v: string) {
      calls.push([k, v]);
      return this;
    },
    order(k: string) {
      calls.push(k);
      return this;
    },
    then(resolve: any) {
      return Promise.resolve({ data: custom, error }).then(resolve);
    },
  };
  const client = {
    from(table: string) {
      assert.equal(table, "organization_student_types");
      return query;
    },
  };
  assert.deepEqual(await getStudentTypes(client as any, "org-trusted"), custom);
  assert.ok(
    calls.some(
      (c) =>
        JSON.stringify(c) ===
        JSON.stringify(["organization_id", "org-trusted"]),
    ),
  );
  assert.deepEqual(calls.slice(-2), ["sort_order", "code"]);
  error = new Error("query failed");
  await assert.rejects(
    getStudentTypes(client as any, "org-trusted"),
    /query failed/,
  );
});
test("type API authenticates first, bounds input and returns conflicts without changing tenant scope", async () => {
  let allowed = true;
  let error: any = null;
  const calls: any[] = [];
  const route = loadMockedModule<{
    action(args: any): Promise<any>;
    loader(args: any): Promise<any>;
  }>(new URL("../app/features/admin/api/student-types.tsx", import.meta.url), {
    "react-router": { data: (body: any, init: any) => ({ body, init }) },
    "~/core/lib/guards.server": { requireMethod: () => () => {} },
    "~/core/lib/request-body": { readBoundedJson, RequestBodyError },
    "~/core/lib/supa-client.server": {
      default: () => [
        {
          rpc: async (name: string, args: any) => {
            calls.push({ name, args });
            return { error };
          },
        },
        new Headers(),
      ],
    },
    "../../organizations/student-types.server": {
      getStudentTypes: async (_client: unknown, org: string) => {
        assert.equal(org, "org-trusted");
        return custom;
      },
    },
    "~/features/organizations/student-type-policy": {
      parseStudentTypePolicy,
      studentTypePolicyFailure,
    },
    "../guards.server": {
      requireAdminRole: async () => {
        if (!allowed) throw new Response(null, { status: 403 });
        return { organizationId: "org-trusted" };
      },
    },
  });
  const req = (body: string) =>
    new Request("https://lestly.test/api/admin/student-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  allowed = false;
  await assert.rejects(
    route.action({ request: req("invalid") }),
    (e: any) => e.status === 403,
  );
  allowed = true;
  assert.equal(
    (await route.action({ request: req("invalid") })).init.status,
    400,
  );
  assert.equal(
    (
      await route.action({
        request: req(
          JSON.stringify({ types: [], expected: DEFAULT_STUDENT_TYPES }),
        ),
      })
    ).init.status,
    400,
  );
  assert.equal(
    (
      await route.action({
        request: req(JSON.stringify({ padding: "x".repeat(65537) })),
      })
    ).init.status,
    413,
  );
  assert.equal(calls.length, 0);
  const refreshed = await route.loader({
    request: new Request("https://lestly.test/api/admin/student-types"),
  });
  assert.deepEqual(refreshed.body.studentTypes, custom);
  assert.equal(
    refreshed.init.headers.get("Cache-Control"),
    "private, no-store",
  );
  const body = JSON.stringify({
    types: custom,
    expected: DEFAULT_STUDENT_TYPES,
  });
  assert.equal((await route.action({ request: req(body) })).body.success, true);
  assert.equal(calls[0].args.p_org, "org-trusted");
  assert.equal(calls[0].name, "save_student_types");
  error = { message: "student_types_conflict" };
  assert.equal((await route.action({ request: req(body) })).init.status, 409);
});
