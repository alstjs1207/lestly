import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root)),
);
const entry = journal.entries.find((x) => x.idx === 24);
const source = await fs.readFile(new URL(entry.tag + ".sql", root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const fingerprint = async (q) =>
  (
    await q`SELECT
 (SELECT count(*)::int FROM profiles) profiles,
 (SELECT count(*)::int FROM organization_members) memberships,
 (SELECT count(*)::int FROM schedules) schedules,
 (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM profiles p) profiles_hash,
 (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM organization_members m) memberships_hash,
 (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY schedule_id)) FROM schedules s) schedules_hash,
 (SELECT md5(string_agg((to_jsonb(n)-'delivery_cancelled_at')::text,'|' ORDER BY notification_id)) FROM notifications n) notifications_hash,
 (SELECT md5(string_agg(to_jsonb(i)::text,'|' ORDER BY invite_id)) FROM student_invites i) invites_hash`
  )[0];
try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='45s'`;
    await q`SELECT pg_advisory_xact_lock(20261025,24)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    for (const idx of [16, 17, 18, 19, 20, 21, 22, 23]) {
      const e = journal.entries.find((x) => x.idx === idx);
      const expected = createHash("sha256")
        .update(await fs.readFile(new URL(e.tag + ".sql", root)))
        .digest("hex");
      assert.equal(
        ledger.find((x) => String(x.created_at) === String(e.when))?.hash,
        expected,
        `Prerequisite ${idx} mismatch`,
      );
    }
    const applied = ledger.find(
      (x) => String(x.created_at) === String(entry.when),
    );
    if (applied) {
      assert.equal(applied.hash, hash);
      return { alreadyApplied: true, hash };
    }
    assert.ok(
      ledger.every((x) => Number(x.created_at) < entry.when),
      "Unexpected newer migration",
    );
    assert.equal(
      Number(
        (
          await q`SELECT count(*) n FROM organization_members WHERE role='STUDENT' AND state='DELETED'`
        )[0].n,
      ),
      0,
      "Withdrawal impact changed since approval",
    );
    const before = await fingerprint(q);
    const definitions =
      await q`SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_current_profile_id','is_org_admin','is_super_admin','guard_schedule_write','save_managed_student','on_schedule_delete')`;
    const policies =
      await q`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
    await fs.writeFile(
      new URL(
        "../../.vercel/student-lifecycle-schema-before.json",
        import.meta.url,
      ),
      JSON.stringify({ definitions, policies }, null, 2) + "\n",
    );
    for (const statement of source.split("--> statement-breakpoint"))
      if (statement.trim()) await q.unsafe(statement);
    await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    await q`NOTIFY pgrst,'reload schema'`;
    assert.deepEqual(
      await fingerprint(q),
      before,
      "Existing business data changed",
    );
    const functions =
      await q`SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_account_auth_context','set_student_state','get_student_change_impact','create_admin_schedule_series','update_admin_schedule_batch','can_deliver_student_notification') ORDER BY p.proname`;
    assert.equal(functions.length, 6);
    assert.ok(functions.every((f) => !f.anon_execute));
    const guards = (
      await q`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND policyname='account_access_guard'`
    )[0].n;
    assert.ok(guards > 5);
    return {
      at: new Date().toISOString(),
      project: "smbpzlzbvplhtpqggrjf",
      migration: entry.tag,
      hash,
      applied: true,
      businessDataUnchanged: true,
      counts: {
        profiles: before.profiles,
        memberships: before.memberships,
        schedules: before.schedules,
      },
      accountGuardPolicies: guards,
      functions,
    };
  });
  await fs.writeFile(
    new URL("20261025_student_lifecycle_apply.result.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ code: e.code, message: e.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
