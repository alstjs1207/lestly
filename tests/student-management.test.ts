import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";

import { buildStudentSearchFilter } from "../app/core/lib/query-utils.ts";
import { readStudentBulkDraft } from "../app/features/admin/lib/student-bulk-draft.ts";
import {
  studentAge,
  studentScheduleDate,
  studentScheduleDay,
  studentScheduleTime,
} from "../app/features/admin/lib/student-display.ts";
import {
  findDuplicateStudentPhone,
  parseStudentForm,
} from "../app/features/admin/lib/student-form.server.ts";
import {
  saveManagedStudent,
  studentSaveFailure,
} from "../app/features/admin/lib/student-save.server.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

const values = {
  name: "홍길동",
  phone: "010-1234-5678",
  region: "서울",
  type: "EXAMINEE" as const,
};

test("phone searches with and without punctuation use the same normalized field", () => {
  for (const search of ["010-1234-5678", "01012345678", "010 1234 5678"]) {
    assert.ok(
      buildStudentSearchFilter(search)?.includes(
        'phone_normalized.ilike."%01012345678%"',
      ),
    );
  }
  assert.ok(
    buildStudentSearchFilter("김하나")?.includes('name.ilike."%김하나%"'),
  );
});

test("individual duplicate lookup filters by normalized phone before the row cap, with tenant and student scope", async () => {
  let url: URL | undefined;
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        url = new URL(String(input));
        return new Response(
          JSON.stringify([
            {
              state: "DELETED",
              profiles: {
                profile_id: "student-1001",
                name: "1001번째 학생",
                phone: "010-1234-5678",
              },
            },
          ]),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  });
  const result = await findDuplicateStudentPhone(client as any, {
    organizationId: "org-a",
    phone: "01012345678",
    excludeProfileId: "editing-student",
  });
  assert.equal(result?.name, "1001번째 학생");
  assert.equal(url?.searchParams.get("organization_id"), "eq.org-a");
  assert.equal(url?.searchParams.get("role"), "eq.STUDENT");
  assert.equal(
    url?.searchParams.get("profiles.phone_normalized"),
    "eq.01012345678",
  );
  assert.equal(url?.searchParams.get("profile_id"), "neq.editing-student");
});

test("transaction helper keeps edit dates empty and assigns create dates only", async () => {
  const calls: any[] = [];
  const client = {
    rpc: async (_name: string, args: any) => {
      calls.push(args);
      return { data: "saved-id", error: null };
    },
  };
  await saveManagedStudent(client as any, "org-a", values);
  await saveManagedStudent(
    client as any,
    "org-a",
    {
      ...values,
      class_start_date: null,
      class_end_date: null,
    },
    "student-id",
  );
  assert.ok(
    calls[0].p_values.class_end_date > calls[0].p_values.class_start_date,
  );
  assert.equal(calls[1].p_student_id, "student-id");
  assert.equal(calls[1].p_values.class_end_date, null);
});

test("bulk drafts restore incomplete input and saved IDs, and reject malformed/expired data", () => {
  const now = Date.now();
  const row = {
    id: "5",
    name: "미완성",
    phone: "010",
    region: "",
    type: "EXAMINEE",
  };
  const text = (rows = [row], updatedAt = now) =>
    JSON.stringify({ rows, clipboard: "복사 중인 명단", updatedAt });
  const restored = readStudentBulkDraft(text(), now);
  assert.equal(restored?.rows[0].phone, "010");
  assert.equal(restored?.clipboard, "복사 중인 명단");
  assert.equal(readStudentBulkDraft(text([row, row]), now), null);
  assert.equal(readStudentBulkDraft(text([row], now - 86_400_001), now), null);
  assert.equal(readStudentBulkDraft(text([row], now + 1), now), null);
  assert.equal(readStudentBulkDraft("bad json", now), null);
  const saved = {
    ...row,
    saved: true,
    profileId: "00000000-0000-0000-0000-000000000099",
  };
  assert.equal(
    readStudentBulkDraft(text([saved]), now)?.rows[0].profileId,
    saved.profileId,
  );
  assert.equal(
    readStudentBulkDraft(text([{ ...row, saved: true } as any]), now),
    null,
  );
});

test("student schedule display and age consistently use the Korean date at midnight", () => {
  const time = new Date("2026-09-30T16:00:00Z");
  assert.equal(studentScheduleDay(time), "목");
  assert.equal(studentScheduleDate(time, "long"), "10월 1일");
  assert.equal(studentScheduleTime(time), "오전 01:00");
  assert.equal(studentAge("2000-10-01", time), 26);
  assert.equal(studentAge("2000-10-01", new Date("2026-09-30T14:59:00Z")), 25);
});

test("update API validates input and maps atomic RPC errors without separate writes", async () => {
  let code: string | undefined;
  const calls: any[] = [];
  const route = loadMockedModule<{
    action(args: {
      request: Request;
      params: { studentId: string };
    }): Promise<any>;
  }>(
    new URL("../app/features/admin/api/students/update.tsx", import.meta.url),
    {
      "react-router": {
        data: (body: unknown, init?: unknown) => ({ body, init }),
        redirect: (url: string) => ({ redirect: url }),
      },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            from() {
              throw new Error("Non-atomic write forbidden");
            },
          },
        ],
      },
      "../../guards.server": {
        requireAdminRole: async () => ({ organizationId: "session-org" }),
      },
      "../../lib/student-form.server": { parseStudentForm },
      "../../lib/student-save.server": {
        studentSaveFailure,
        saveManagedStudent: async (
          _client: unknown,
          org: string,
          payload: any,
          id: string,
        ) => {
          calls.push({ org, payload, id });
          if (code) throw { code };
          return id;
        },
      },
    },
  );
  const submit = (change = {}) =>
    route.action({
      params: { studentId: "target-student" },
      request: new Request(
        "https://lestly.test/api/admin/students/target-student/update",
        {
          method: "POST",
          body: new URLSearchParams({
            ...values,
            color: "#3B82F6",
            organization_id: "forged-org",
            ...change,
          }),
        },
      ),
    });
  assert.equal((await submit({ phone: "bad" })).init.status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await submit()).redirect, "/admin/students/target-student");
  assert.equal(calls[0].org, "session-org");
  assert.equal(calls[0].id, "target-student");
  assert.equal(Object.hasOwn(calls[0].payload, "state"), false);
  for (const state of ["NORMAL", "GRADUATE", "DELETED", "forged"]) {
    assert.equal(
      (await submit({ state })).redirect,
      "/admin/students/target-student",
    );
    assert.equal(Object.hasOwn(calls.at(-1).payload, "state"), false);
  }

  for (const [errorCode, status] of [
    ["23505", 409],
    ["P0002", 404],
    ["42501", 403],
    ["unknown", 500],
  ] as const) {
    code = errorCode;
    assert.equal((await submit()).init.status, status);
  }
});
