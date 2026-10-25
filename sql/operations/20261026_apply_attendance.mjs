import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const project = "smbpzlzbvplhtpqggrjf";
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
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
const entry = journal.entries.find((x) => x.idx === 27);
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const apply = process.argv.includes("--apply");
const fingerprint = async (q) =>
  (
    await q`SELECT
 (SELECT count(*)::int FROM public.profiles) profiles,
 (SELECT count(*)::int FROM public.organization_members) memberships,
 (SELECT count(*)::int FROM public.schedules) schedules,
 (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM public.profiles p) profiles_hash,
 (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM public.organization_members m) memberships_hash,
 (SELECT md5(string_agg((to_jsonb(s)-ARRAY['attendance_status','attendance_version','attendance_updated_at','attendance_updated_by','cancelled_at'])::text,'|' ORDER BY schedule_id)) FROM public.schedules s) schedules_hash,
 (SELECT md5(string_agg(to_jsonb(n)::text,'|' ORDER BY notification_id)) FROM public.notifications n) notifications_hash,
 (SELECT md5(string_agg(to_jsonb(i)::text,'|' ORDER BY invite_id)) FROM public.student_invites i) invites_hash`
  )[0];
const legacyHours = async (q) =>
  (
    await q`SELECT coalesce(sum(total_hours),0)::double precision hours FROM public.get_student_completed_hours(ARRAY(SELECT DISTINCT student_id FROM public.schedules))`
  )[0].hours;

try {
  const result = await sql.begin(async (q) => {
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    else await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='45s'`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    for (const idx of [24, 25, 26]) {
      const previous = journal.entries.find((x) => x.idx === idx);
      const expected = createHash("sha256")
        .update(await fs.readFile(new URL(`${previous.tag}.sql`, root)))
        .digest("hex");
      assert.equal(
        ledger.find((x) => String(x.created_at) === String(previous.when))
          ?.hash,
        expected,
        `Prerequisite ${idx} mismatch`,
      );
    }
    const applied = ledger.find(
      (x) => String(x.created_at) === String(entry.when),
    );
    if (applied) {
      assert.equal(
        applied.hash,
        hash,
        "Applied migration differs from local source",
      );
      return {
        at: new Date().toISOString(),
        project,
        migration: entry.tag,
        hash,
        alreadyApplied: true,
      };
    }
    assert.ok(
      ledger.every((x) => Number(x.created_at) < entry.when),
      "Unexpected newer migration",
    );
    const columns =
      await q`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='schedules' AND column_name IN ('attendance_status','cancelled_at')`;
    assert.equal(
      columns.length,
      0,
      "Attendance columns exist without matching migration ledger",
    );
    const before = await fingerprint(q);
    const previousLegacyHours = await legacyHours(q);
    if (!apply)
      return {
        at: new Date().toISOString(),
        project,
        migration: entry.tag,
        hash,
        readOnly: true,
        prerequisitesVerified: true,
        counts: {
          profiles: before.profiles,
          memberships: before.memberships,
          schedules: before.schedules,
        },
        legacyCompletedHours: previousLegacyHours,
      };
    await q`SELECT pg_advisory_xact_lock(20261026,27)`;
    const definitions =
      await q`SELECT p.proname,pg_get_functiondef(p.oid) definition,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('guard_schedule_write','get_student_booking_availability','get_student_change_impact','apply_student_membership_lifecycle','get_student_completed_hours') ORDER BY p.proname`;
    await fs.writeFile(
      new URL("../../.vercel/attendance-schema-before.json", import.meta.url),
      JSON.stringify({ at: new Date().toISOString(), definitions }, null, 2) +
        "\n",
    );
    for (const statement of source.split("--> statement-breakpoint"))
      if (statement.trim()) await q.unsafe(statement);
    assert.deepEqual(
      await fingerprint(q),
      before,
      "Existing business records changed",
    );
    assert.equal(
      await legacyHours(q),
      previousLegacyHours,
      "Legacy production totals changed",
    );
    const initial = (
      await q`SELECT count(*)::int total,count(*) FILTER(WHERE attendance_status='PENDING' AND attendance_version=0 AND attendance_updated_at IS NULL AND attendance_updated_by IS NULL AND cancelled_at IS NULL)::int pending FROM public.schedules`
    )[0];
    assert.equal(
      initial.total,
      initial.pending,
      "Existing attendance was inferred",
    );
    assert.equal(
      (await q`SELECT count(*)::int n FROM public.attendance_events`)[0].n,
      0,
    );
    assert.equal(
      (
        await q`SELECT coalesce(sum(total_hours),0)::double precision hours FROM public.get_student_attended_hours(ARRAY(SELECT DISTINCT student_id FROM public.schedules))`
      )[0].hours,
      0,
    );
    const functions =
      await q`SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('save_attendance','get_student_attended_hours') ORDER BY p.proname`;
    assert.equal(functions.length, 2);
    assert.ok(
      functions.every((f) => !f.anon_execute && f.authenticated_execute),
    );
    const privileges = (
      await q`SELECT has_table_privilege('authenticated','public.attendance_events','SELECT') can_read,has_table_privilege('authenticated','public.attendance_events','INSERT') can_insert,has_table_privilege('authenticated','public.attendance_events','UPDATE') can_update,has_table_privilege('authenticated','public.attendance_events','DELETE') can_delete`
    )[0];
    assert.deepEqual(privileges, {
      can_read: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
    });
    await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    await q`NOTIFY pgrst,'reload schema'`;
    return {
      at: new Date().toISOString(),
      project,
      migration: entry.tag,
      hash,
      applied: true,
      businessDataUnchanged: true,
      legacyProductionTotalsUnchanged: true,
      legacyCompletedHours: previousLegacyHours,
      counts: {
        profiles: before.profiles,
        memberships: before.memberships,
        schedules: before.schedules,
      },
      pendingReservations: initial.pending,
      attendanceEvents: 0,
      functions,
      eventPrivileges: privileges,
    };
  });
  const name = apply
    ? "20261026_attendance_apply.result.json"
    : "20261026_attendance_preflight.result.json";
  await fs.writeFile(
    new URL(name, import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
