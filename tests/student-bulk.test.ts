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

test("bulk save calls the atomic RPC with scoped required fields and returns profile IDs", async () => {
  const calls: any[] = [];
  const client = {
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      return { data: "00000000-0000-0000-0000-000000000099", error: null };
    },
  };
  const results = await createBulkStudents(client as any, "org-a", [
    row(),
    row(1),
  ]);
  assert.deepEqual(
    results.map((item) => item.success),
    [true, true],
  );
  assert.ok(
    results.every(
      (item) => item.profileId === "00000000-0000-0000-0000-000000000099",
    ),
  );
  for (const call of calls) {
    assert.equal(call.name, "save_managed_student");
    assert.equal(call.args.p_organization_id, "org-a");
    assert.ok(
      call.args.p_values.class_end_date > call.args.p_values.class_start_date,
    );
    assert.equal(call.args.p_values.auth_user_id, undefined);
  }
});

test("bulk RPC failure reports only failed rows and keeps successful profile IDs", async () => {
  let count = 0;
  const client = {
    rpc: async () =>
      ++count === 1
        ? { data: null, error: { code: "23505" } }
        : { data: "00000000-0000-0000-0000-000000000099", error: null },
  };
  const results = await createBulkStudents(client as any, "org-a", [
    row(),
    row(1),
  ]);
  assert.deepEqual(
    results.map((item) => item.success),
    [false, true],
  );
  assert.match(results[0].error ?? "", /동일한 전화번호/);
  assert.equal(results[0].profileId, undefined);
  assert.ok(results[1].profileId);
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
    in(key: string, values: string[]) {
      assert.equal(key, "profiles.phone_normalized");
      assert.deepEqual(values, [row().phone, row(1).phone]);
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
