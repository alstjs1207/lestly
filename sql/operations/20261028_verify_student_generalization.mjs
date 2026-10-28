// Exercise live PostgreSQL roles and RPCs; all probe writes are rolled back.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 3,
  connect_timeout: 10,
  onnotice() {},
});
const checks = [];
const rollback = new Error("verification_rollback");
const list = (q, org) =>
  q`SELECT code,label,sort_order,is_active,is_default FROM public.organization_student_types WHERE organization_id=${org} ORDER BY sort_order,code`;
const role = async (q, name, id) => {
  assert.match(name, /^(authenticated|anon|postgres)$/);
  await q.unsafe(`SET LOCAL ROLE ${name}`);
  await q`SELECT set_config('request.jwt.claim.sub',${id ?? ""},true)`;
  await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: id, role: name })},true)`;
};
const saveTypes = (q, org, types, expected) =>
  q`SELECT public.save_student_types(${org},${q.json(types)},${q.json(expected)})`;
try {
  const [admin] =
    await db`SELECT p.auth_user_id,p.profile_id,m.organization_id FROM public.profiles p JOIN public.organization_members m USING(profile_id)
    WHERE m.role='ADMIN' AND m.state='NORMAL' AND p.auth_user_id IS NOT NULL LIMIT 1`;
  const [student] =
    await db`SELECT p.auth_user_id FROM public.profiles p JOIN public.organization_members m USING(profile_id)
    WHERE m.role='STUDENT' AND p.auth_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.organization_members a WHERE a.profile_id=p.profile_id AND a.role='ADMIN') LIMIT 1`;
  assert.ok(admin && student, "Linked admin and student are required");
  const org = randomUUID();
  await assert.rejects(
    db.begin(async (q) => {
      await q`SET LOCAL statement_timeout='20s'`;
      await q`INSERT INTO public.organizations(organization_id,name) VALUES(${org},'Phase 1 2 rollback verification')`;
      await q`INSERT INTO public.organization_members(organization_id,profile_id,role,state) VALUES(${org},${admin.profile_id},'ADMIN','NORMAL')`;
      const before = await list(q, org);
      assert.deepEqual(
        before.map(({ code, label, sort_order, is_active, is_default }) => ({
          code,
          label,
          sort_order,
          is_active,
          is_default,
        })),
        [
          {
            code: "STUDENT",
            label: "학생",
            sort_order: 0,
            is_active: true,
            is_default: true,
          },
          {
            code: "ADULT",
            label: "성인",
            sort_order: 1,
            is_active: true,
            is_default: false,
          },
        ],
      );
      checks.push("new_organization_defaults");
      await role(q, "authenticated", admin.auth_user_id);
      const changed = [
        {
          code: "TYPE_QA",
          label: "검증용 분류",
          sort_order: 0,
          is_active: true,
          is_default: true,
        },
        { ...before[0], label: "학생 분류", sort_order: 1, is_default: false },
        { ...before[1], sort_order: 2 },
      ];
      await saveTypes(q, org, changed, before);
      assert.deepEqual(JSON.parse(JSON.stringify(await list(q, org))), changed);
      checks.push("admin_add_rename_order_default");
      await assert.rejects(
        q.savepoint((s) => saveTypes(s, org, before, before)),
        (error) =>
          error.code === "PT409" &&
          /student_types_conflict/.test(error.message),
      );
      checks.push("stale_snapshot_rejected");
      for (const invalid of [
        changed.map((t) => ({ ...t, is_default: false })),
        changed.map((t) => ({ ...t, is_active: false, is_default: false })),
      ])
        await assert.rejects(
          q.savepoint((s) => saveTypes(s, org, invalid, changed)),
          /invalid_student_types/,
        );
      checks.push("active_and_default_required");
      const values = {
        name: "Rollback verification student",
        phone: "01000009129",
        type: "TYPE_QA",
        region: "   ",
        description: "보존 메모",
      };
      const [created] =
        await q`SELECT public.save_managed_student(${org},${q.json(values)},NULL) id`;
      const [profile] =
        await q`SELECT region FROM public.profiles WHERE profile_id=${created.id}`;
      assert.equal(profile.region, null);
      checks.push("student_create_optional_region");
      const inactive = changed.map((t) =>
        t.code === "TYPE_QA"
          ? { ...t, is_active: false, is_default: false }
          : t.code === "STUDENT"
            ? { ...t, is_default: true }
            : t,
      );
      await saveTypes(q, org, inactive, changed);
      await q`SELECT public.save_managed_student(${org},${q.json({ ...values, name: "Edited rollback student", region: "" })},${created.id})`;
      await assert.rejects(
        q.savepoint(
          (s) =>
            s`SELECT public.save_managed_student(${org},${s.json({ ...values, phone: "01000009130" })},NULL)`,
        ),
        /invalid_student_values/,
      );
      checks.push("inactive_existing_preserved_new_assignment_rejected");
      const [legacy] =
        await q`SELECT public.save_managed_student(${org},${q.json({ ...values, type: "DROPPER", phone: "01000009131" })},NULL) id`;
      const [legacyData] =
        await q`SELECT p.description,m.type FROM public.profiles p JOIN public.organization_members m USING(profile_id) WHERE p.profile_id=${legacy.id} AND m.organization_id=${org}`;
      assert.equal(legacyData.type, "STUDENT");
      assert.equal(legacyData.description, "보존 메모\n[이전 유형: 재수생]");
      checks.push("legacy_caller_normalization_and_retaker_note");
      await role(q, "authenticated", student.auth_user_id);
      assert.equal((await list(q, org)).length, 0);
      await assert.rejects(
        q.savepoint((s) => saveTypes(s, org, inactive, inactive)),
        /student_types_access_denied/,
      );
      await assert.rejects(
        q.savepoint(
          (s) =>
            s`UPDATE public.organization_student_types SET label='Rejected' WHERE organization_id=${org}`,
        ),
        /permission denied/,
      );
      checks.push("student_foreign_organization_and_direct_write_denied");
      await role(q, "anon");
      await assert.rejects(
        q.savepoint((s) => saveTypes(s, org, inactive, inactive)),
        /permission denied/,
      );
      checks.push("anonymous_rpc_denied");
      await role(q, "postgres");
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
      throw rollback;
    }),
    (error) => error === rollback,
  );
  assert.equal(
    (
      await db`SELECT count(*)::int n FROM public.organizations WHERE organization_id=${org}`
    )[0].n,
    0,
  );
  checks.push("all_probe_rows_rolled_back");

  // Hold the actual organization lock in one connection and verify another waits.
  const types = JSON.parse(
    JSON.stringify(await list(db, admin.organization_id)),
  );
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  let locked;
  const ready = new Promise((resolve) => {
    locked = resolve;
  });
  const holder = db
    .begin(async (q) => {
      await role(q, "authenticated", admin.auth_user_id);
      await saveTypes(q, admin.organization_id, types, types);
      locked();
      await released;
      throw rollback;
    })
    .catch((error) => {
      if (error !== rollback) throw error;
    });
  await ready;
  let waiterDone = false;
  const waiter = db
    .begin(async (q) => {
      await q`SET LOCAL statement_timeout='10s'`;
      await role(q, "authenticated", admin.auth_user_id);
      const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
      const pending = saveTypes(q, admin.organization_id, types, types).then(
        () => {},
      );
      let waiting = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        waiting = (
          await db`SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=${pid}`
        )[0]?.waiting;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(
        waiting,
        true,
        "Second RPC must wait for the organization lock",
      );
      assert.equal(waiterDone, false);
      release();
      await pending;
      waiterDone = true;
      throw rollback;
    })
    .catch((error) => {
      release();
      if (error !== rollback) throw error;
    });
  await Promise.all([holder, waiter]);
  assert.equal(waiterDone, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await list(db, admin.organization_id))),
    types,
  );
  checks.push("two_connection_serialization_and_rollback");
  const result = {
    at: new Date().toISOString(),
    project: "smbpzlzbvplhtpqggrjf",
    checks,
    passed: checks.length,
    probeDataRemaining: false,
  };
  await fs.writeFile(
    new URL(
      "20261028_student_generalization_roles.result.json",
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code,
      message: String(error.message).split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
