import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const mode = process.argv[2] ?? "preflight";
assert.ok(["preflight", "apply"].includes(mode), "Use preflight or apply");
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
const project = "smbpzlzbvplhtpqggrjf";
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const connection = new URL(env.DATABASE_URL);
assert.equal(connection.hostname, "aws-1-ap-northeast-2.pooler.supabase.com");
assert.ok(
  decodeURIComponent(connection.username).endsWith(`.${project}`),
  "Unexpected database project",
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
);
const entry = journal.entries.find((e) => e.idx === 21);
assert.equal(entry.tag, "0021_student_learning_experience");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const fingerprint = async (q) =>
  (
    await q`SELECT
  (SELECT count(*)::int FROM public.profiles) AS profiles,
  (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM public.profiles p) AS profile_hash,
  (SELECT count(*)::int FROM public.organization_members) AS memberships,
  (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM public.organization_members m) AS membership_hash,
  (SELECT count(*)::int FROM public.schedules) AS schedules,
  (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY schedule_id)) FROM public.schedules s) AS schedule_hash,
  (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY program_id)) FROM public.programs p) AS program_hash,
  (SELECT md5(string_agg(to_jsonb(i)::text,'|' ORDER BY instructor_id)) FROM public.instructors i) AS instructor_hash`
  )[0];

try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='30s'`;
    await q`SELECT pg_advisory_xact_lock(20261023,21)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    for (const index of [16, 17, 18, 19, 20]) {
      const prerequisite = journal.entries.find((e) => e.idx === index);
      const expected = createHash("sha256")
        .update(await fs.readFile(new URL(`${prerequisite.tag}.sql`, root)))
        .digest("hex");
      assert.equal(
        ledger.find((e) => String(e.created_at) === String(prerequisite.when))
          ?.hash,
        expected,
        `Prerequisite ${index} is missing or changed`,
      );
    }
    assert.ok(
      ledger.every((e) => Number(e.created_at) <= entry.when),
      "A newer migration requires review",
    );
    const previous = ledger.find(
      (e) => String(e.created_at) === String(entry.when),
    );
    if (previous) assert.equal(previous.hash, hash, "Migration hash mismatch");
    const before = await fingerprint(q);
    if (mode === "apply" && !previous) {
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await q.unsafe(statement);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES (${hash},${entry.when})`;
      await q`NOTIFY pgrst, 'reload schema'`;
    }
    const applied = !!previous || mode === "apply";
    let verification = null;
    if (applied) {
      const functions =
        await q`SELECT proname,prosecdef,proconfig FROM pg_proc WHERE oid IN
        ('public.get_student_completed_hours(uuid[],uuid)'::regprocedure,'public.get_student_booking_availability(uuid,date,integer)'::regprocedure)`;
      assert.equal(functions.length, 2);
      assert.equal(
        functions.find((f) => f.proname === "get_student_completed_hours")
          .prosecdef,
        false,
      );
      assert.equal(
        functions.find((f) => f.proname === "get_student_booking_availability")
          .prosecdef,
        true,
      );
      const privileges = (
        await q`SELECT
        has_function_privilege('anon','public.get_student_completed_hours(uuid[],uuid)','EXECUTE') AS anon_hours,
        has_function_privilege('anon','public.get_student_booking_availability(uuid,date,integer)','EXECUTE') AS anon_availability,
        has_function_privilege('authenticated','public.get_student_completed_hours(uuid[],uuid)','EXECUTE') AS student_hours,
        has_function_privilege('authenticated','public.get_student_booking_availability(uuid,date,integer)','EXECUTE') AS student_availability`
      )[0];
      assert.deepEqual(
        { ...privileges },
        {
          anon_hours: false,
          anon_availability: false,
          student_hours: true,
          student_availability: true,
        },
      );
      const policies =
        await q`SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND policyname IN ('student-select-active-program-instructors','student-select-scheduled-programs') ORDER BY policyname`;
      assert.equal(policies.length, 2);
      const students =
        await q`SELECT p.auth_user_id,p.profile_id,m.organization_id FROM public.profiles p JOIN public.organization_members m ON m.profile_id=p.profile_id WHERE p.auth_user_id IS NOT NULL AND m.role='STUDENT' AND m.state='NORMAL' ORDER BY p.profile_id LIMIT 1`;
      let studentRead = null;
      if (students.length) {
        const student = students[0];
        const expectedHours = Number(
          (
            await q`SELECT coalesce(sum(extract(epoch from (end_time-start_time))/3600.0),0)::double precision AS hours FROM public.schedules WHERE student_id=${student.profile_id} AND end_time<=now() AND end_time>start_time`
          )[0].hours,
        );
        await q`SET LOCAL ROLE authenticated`;
        await q`SELECT set_config('request.jwt.claim.sub',${student.auth_user_id},true)`;
        const totals =
          await q`SELECT * FROM public.get_student_completed_hours(ARRAY[${student.profile_id}]::uuid[])`;
        assert.ok(
          Math.abs(Number(totals[0]?.total_hours ?? 0) - expectedHours) <
            0.000001,
        );
        const slots =
          await q`SELECT available,reason FROM public.get_student_booking_availability(${student.organization_id},(now() AT TIME ZONE 'Asia/Seoul')::date,3)`;
        assert.equal(slots.length, 23);
        await q`SELECT program_id,title,location_address FROM public.programs WHERE program_id IN (SELECT program_id FROM public.schedules)`;
        await q`SELECT name FROM public.instructors`;
        await q`RESET ROLE`;
        studentRead = {
          completedHoursMatch: true,
          availabilitySlots: slots.length,
          classAndInstructorRead: true,
        };
      }
      verification = {
        functions: functions.map((f) => ({
          name: f.proname,
          securityDefiner: f.prosecdef,
        })),
        privileges,
        policies,
        studentRead,
      };
    }
    assert.deepEqual(
      await fingerprint(q),
      before,
      "Business rows changed during the migration",
    );
    return {
      mode,
      project,
      at: new Date().toISOString(),
      migration: entry.tag,
      hash,
      alreadyApplied: !!previous,
      applied,
      businessDataUnchanged: true,
      counts: {
        profiles: before.profiles,
        memberships: before.memberships,
        schedules: before.schedules,
      },
      verification,
    };
  });
  const resultUrl = new URL(
    `20261023_student_learning_${mode}.result.json`,
    import.meta.url,
  );
  await fs.writeFile(resultUrl, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({ code: error.code ?? null, message: error.message }),
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
