import type { BulkStudentRow } from "../app/features/admin/lib/student-bulk.ts";

import assert from "node:assert/strict";
import test from "node:test";

import {
  createBulkStudents,
  findBulkStudentDuplicates,
} from "../app/features/admin/lib/student-bulk.server.ts";
import {
  MAX_BULK_STUDENTS,
  parseBulkStudents,
  parseStudentClipboard,
} from "../app/features/admin/lib/student-bulk.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const row = (index = 0): BulkStudentRow => ({
  id: String(index),
  name: `수강생 ${index}`,
  phone: `0101234${String(index).padStart(4, "0")}`,
  region: "서울",
  type: "EXAMINEE",
});

test("bulk registration accepts only the four required fields and trims values", () => {
  const result = parseBulkStudents([
    { ...row(), name: " 홍길동 ", region: " 서울 " },
  ]);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data[0].name, "홍길동");
    assert.equal(result.data[0].region, "서울");
  }
  for (const change of [
    { name: " " },
    { region: "" },
    { phone: "010" },
    { type: "UNKNOWN" },
  ]) {
    assert.equal(parseBulkStudents([{ ...row(), ...change }]).success, false);
  }
});

test("bulk registration rejects empty, oversized and duplicate row/phone submissions", () => {
  assert.equal(parseBulkStudents([]).success, false);
  assert.equal(
    parseBulkStudents(
      Array.from({ length: MAX_BULK_STUDENTS }, (_, i) => row(i)),
    ).success,
    true,
  );
  assert.equal(
    parseBulkStudents(
      Array.from({ length: MAX_BULK_STUDENTS + 1 }, (_, i) => row(i)),
    ).success,
    false,
  );
  assert.equal(
    parseBulkStudents([row(), { ...row(1), id: "0" }]).success,
    false,
  );
  const result = parseBulkStudents([
    row(),
    { ...row(1), phone: "010-1234-0000" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(
      result.error.issues.map((issue) => issue.path),
      [
        [0, "phone"],
        [1, "phone"],
      ],
    );
  }
});

test("spreadsheet paste handles headers, blank lines, CRLF and optional Korean/enum types", () => {
  const rows = parseStudentClipboard(
    "이름\t전화번호\t지역\t유형\r\n홍길동\t01012340000\t서울\t성인\r\n\r\n김하나\t01012340001\t경기\r\n이둘\t01012340002\t인천\tDROPPER\r\n",
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((item) => item.type),
    ["ADULT", "EXAMINEE", "DROPPER"],
  );
  assert.deepEqual(parseStudentClipboard("\n  \n"), []);
  assert.equal(parseStudentClipboard("\t01012340000\t서울")[0].name, "");
  assert.equal(parseStudentClipboard("홍길동\t01012340000\t")[0].region, "");
  assert.throws(
    () => parseStudentClipboard("가\t나\t다\t라\t마"),
    /최대 4개 열/,
  );
  assert.equal(
    parseBulkStudents(
      parseStudentClipboard("홍길동\t01012340000\t서울\t오타").map((item) => ({
        ...item,
        id: "0",
      })),
    ).success,
    false,
  );
});

function fakeClient({
  failProfile = false,
  failMembership = false,
  failCleanup = false,
} = {}) {
  const profiles: any[] = [];
  const memberships: any[] = [];
  const deleted: string[] = [];
  const client = {
    from(table: string) {
      return {
        async insert(value: any) {
          if (table === "profiles") {
            if (failProfile) return { error: new Error("profile") };
            profiles.push(value);
          } else {
            if (failMembership && memberships.length === 0) {
              failMembership = false;
              return { error: new Error("membership") };
            }
            memberships.push(value);
          }
          return { error: null };
        },
        delete() {
          return {
            async eq(_key: string, id: string) {
              if (failCleanup) return { error: new Error("cleanup") };
              deleted.push(id);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as any, profiles, memberships, deleted };
}

test("bulk save creates organization-scoped managed students with one-year defaults and no auth accounts", async () => {
  const db = fakeClient();
  const results = await createBulkStudents(db.client, "org-a", [row(), row(1)]);
  assert.deepEqual(
    results.map((item) => item.success),
    [true, true],
  );
  assert.equal(db.profiles.length, 2);
  for (const [index, profile] of db.profiles.entries()) {
    assert.equal(profile.auth_user_id, null);
    assert.equal(profile.contact_email, null);
    assert.equal(profile.marketing_consent, false);
    assert.ok(profile.class_end_date > profile.class_start_date);
    assert.equal(db.memberships[index].organization_id, "org-a");
    assert.equal(db.memberships[index].profile_id, profile.profile_id);
    assert.equal(db.memberships[index].role, "STUDENT");
    assert.equal(db.memberships[index].state, "NORMAL");
  }
});

test("membership failure removes only the incomplete profile and reports partial success", async () => {
  const db = fakeClient({ failMembership: true });
  const results = await createBulkStudents(db.client, "org-a", [row(), row(1)]);
  assert.deepEqual(
    results.map((item) => item.success),
    [false, true],
  );
  assert.deepEqual(db.deleted, [db.profiles[0].profile_id]);
  assert.equal(db.memberships.length, 1);
});

test("profile failure never creates a membership; cleanup failure asks for state verification", async () => {
  const db = fakeClient({ failProfile: true });
  assert.equal(
    (await createBulkStudents(db.client, "org-a", [row()]))[0].success,
    false,
  );
  assert.equal(db.memberships.length, 0);
  const cleanup = fakeClient({ failMembership: true, failCleanup: true });
  assert.match(
    (await createBulkStudents(cleanup.client, "org-a", [row()]))[0].error ?? "",
    /등록 상태 확인/,
  );
});

test("duplicate lookup scopes the organization and paginates beyond 1000 including inactive memberships", async () => {
  const offsets: number[] = [];
  const filters: unknown[] = [];
  const query = {
    select() {
      return this;
    },
    eq(key: string, value: string) {
      filters.push([key, value]);
      return this;
    },
    order() {
      return this;
    },
    async range(start: number) {
      offsets.push(start);
      return {
        data:
          start === 0
            ? Array.from({ length: 1000 }, () => ({
                profiles: { phone: null, name: "기타" },
              }))
            : [{ profiles: { phone: "010-1234-0000", name: "기존 수강생" } }],
        error: null,
      };
    },
  };
  const results = await findBulkStudentDuplicates(
    { from: () => query } as any,
    "org-a",
    [row(), row(1)],
  );
  assert.deepEqual(offsets, [0, 1000]);
  assert.deepEqual(filters, [
    ["organization_id", "org-a"],
    ["role", "STUDENT"],
    ["organization_id", "org-a"],
    ["role", "STUDENT"],
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "0");
  assert.match(results[0].error ?? "", /기존 수강생/);
});

test("bulk API authenticates before reading rows and never writes invalid or duplicate submissions", async () => {
  let allowed = true;
  let duplicate = false;
  let checked = 0;
  let saved = 0;
  const route = loadMockedModule<{
    action(args: { request: Request }): Promise<any>;
  }>(
    new URL(
      "../app/features/admin/api/students/bulk-create.tsx",
      import.meta.url,
    ),
    {
      "react-router": {
        data: (body: unknown, init?: unknown) => ({ body, init }),
      },
      "~/core/lib/guards.server": {
        requireMethod: () => (request: Request) => {
          if (request.method !== "POST")
            throw new Response(null, { status: 405 });
        },
      },
      "~/core/lib/supa-admin-client.server": { default: {} },
      "~/core/lib/supa-client.server": { default: () => [{}] },
      "../../guards.server": {
        requireAdminRole: async () => {
          if (!allowed) throw new Response(null, { status: 403 });
          return { organizationId: "org-from-session" };
        },
      },
      "../../lib/student-bulk": { parseBulkStudents },
      "../../lib/student-bulk.server": {
        findBulkStudentDuplicates: async (_client: unknown, org: string) => {
          assert.equal(org, "org-from-session");
          checked++;
          return duplicate ? [{ id: "0", success: false, error: "중복" }] : [];
        },
        createBulkStudents: async (_client: unknown, org: string) => {
          assert.equal(org, "org-from-session");
          saved++;
          return [{ id: "0", success: true }];
        },
      },
    },
  );
  const request = (students: string) =>
    new Request("https://lestly.test/api/admin/students/bulk-create", {
      method: "POST",
      body: new URLSearchParams({ students, organization_id: "attacker-org" }),
    });
  allowed = false;
  await assert.rejects(
    route.action({ request: request("invalid") }),
    (error: any) => error.status === 403,
  );
  allowed = true;
  for (const input of [
    "invalid",
    JSON.stringify([{ ...row(), phone: "bad" }]),
  ]) {
    assert.equal(
      (await route.action({ request: request(input) })).init.status,
      400,
    );
  }
  assert.equal(checked, 0);
  assert.equal(saved, 0);
  duplicate = true;
  assert.equal(
    (await route.action({ request: request(JSON.stringify([row()])) })).init
      .status,
    409,
  );
  assert.equal(saved, 0);
  duplicate = false;
  assert.equal(
    (await route.action({ request: request(JSON.stringify([row()])) })).body
      .results[0].success,
    true,
  );
  assert.equal(saved, 1);
});
