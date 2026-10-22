// Explicit phased rollout: prepare while the previous app is serving, finalize
// only after the new app uses the booking RPC and validated server uploads.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const phase = process.argv[2];
if (!["prepare", "finalize"].includes(phase))
  throw new Error(
    "Usage: node sql/operations/20261022_apply_security.mjs prepare|finalize",
  );
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
  "Unexpected target project",
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice: () => {},
});
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
);
const sources = new Map();
for (const index of [16, 17, 18, 19, 20]) {
  const entry = journal.entries.find((e) => e.idx === index);
  const source = await fs.readFile(new URL(entry.tag + ".sql", root), "utf8");
  sources.set(index, {
    entry,
    source,
    hash: createHash("sha256").update(source).digest("hex"),
  });
}
const fingerprint = async (q) =>
  (
    await q`SELECT
 (SELECT count(*)::int FROM public.profiles) AS profiles,
 (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM public.profiles p) AS profile_hash,
 (SELECT count(*)::int FROM public.organization_members) AS memberships,
 (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM public.organization_members m) AS membership_hash,
 (SELECT count(*)::int FROM public.schedules) AS schedules,
 (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY schedule_id)) FROM public.schedules s) AS schedule_hash`
  )[0];
try {
  const result = await sql.begin(async (q) => {
    await q`select pg_advisory_xact_lock(20261022,1919)`;
    await q`set local lock_timeout='10s'`;
    const before = await fingerprint(q);
    const run = async (index, stage = false) => {
      const { entry, source, hash } = sources.get(index);
      const previous =
        await q`select hash from drizzle.__drizzle_migrations where created_at=${entry.when}`;
      if (previous.length) {
        assert.equal(previous[0].hash, hash);
        return;
      }
      let migration = source;
      if (stage)
        migration = migration.replace(
          'DROP POLICY IF EXISTS "student-insert-own-schedules-policy" ON public.schedules;',
          "-- Removal waits for the RPC app deployment.",
        );
      for (const statement of migration.split("--> statement-breakpoint"))
        if (statement.trim()) await q.unsafe(statement);
      if (!stage)
        await q`insert into drizzle.__drizzle_migrations(hash,created_at) values(${hash},${entry.when})`;
    };
    if (phase === "prepare") {
      const checks = (
        await fs.readFile(
          new URL("../checks/tenant_integrity.sql", import.meta.url),
          "utf8",
        )
      )
        .replace(/--[^\n]*/g, "")
        .split(";")
        .filter((s) => s.trim());
      for (const check of checks)
        assert.equal(
          (await q.unsafe(check)).length,
          0,
          "Existing tenant integrity errors require review",
        );
      for (const index of [16, 17, 18]) await run(index);
      const guard =
        await q`select 1 from pg_trigger where tgname='guard_schedule_write' and tgrelid='public.schedules'::regclass`;
      if (!guard.length) await run(19, true);
      const constraints =
        await q`select conrelid::regclass::text as relation,conname from pg_constraint where conname in ('programs_instructor_tenant_fk','schedules_program_tenant_fk','schedules_valid_time_range','notifications_program_tenant_fk','notifications_schedule_tenant_fk','notifications_parent_tenant_fk','in_app_notifications_notification_tenant_fk','student_invites_member_tenant_fk') and not convalidated`;
      for (const c of constraints) {
        assert.match(c.relation, /^[a-z_\.]+$/);
        assert.match(c.conname, /^[a-z_]+$/);
        await q.unsafe(
          `ALTER TABLE ${c.relation} VALIDATE CONSTRAINT ${c.conname}`,
        );
      }
    } else {
      assert.ok(
        (
          await q`select 1 from pg_trigger where tgname='guard_schedule_write' and tgrelid='public.schedules'::regclass`
        ).length,
        "prepare must finish first",
      );
      await q`DROP POLICY IF EXISTS "student-insert-own-schedules-policy" ON public.schedules`;
      const { entry, hash } = sources.get(19);
      const previous =
        await q`select hash from drizzle.__drizzle_migrations where created_at=${entry.when}`;
      if (previous.length) assert.equal(previous[0].hash, hash);
      else
        await q`insert into drizzle.__drizzle_migrations(hash,created_at) values(${hash},${entry.when})`;
      await run(20);
    }
    const after = await fingerprint(q);
    assert.deepEqual(
      after,
      before,
      "Business data must remain unchanged by the security migration",
    );
    await q`NOTIFY pgrst, 'reload schema'`;
    return {
      phase,
      at: new Date().toISOString(),
      businessDataUnchanged: true,
      counts: {
        profiles: after.profiles,
        memberships: after.memberships,
        schedules: after.schedules,
      },
      migrationHashes: Object.fromEntries(
        [...sources].map(([i, s]) => [i, s.hash]),
      ),
      ledger:
        await q`select created_at,hash from drizzle.__drizzle_migrations where created_at>=1790953200000 order by created_at`,
    };
  });
  await fs.writeFile(
    new URL(`20261022_security_${phase}.result.json`, import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
