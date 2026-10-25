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
const entry = journal.entries.find((x) => x.idx === 25);
const source = await fs.readFile(new URL(entry.tag + ".sql", root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const fingerprint = async (q) =>
  (
    await q`SELECT
 (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM profiles p) profiles,
 (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM organization_members m) memberships,
 (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY schedule_id)) FROM schedules s) schedules,
 (SELECT md5(string_agg(to_jsonb(n)::text,'|' ORDER BY notification_id)) FROM notifications n) notifications,
 (SELECT md5(string_agg(to_jsonb(i)::text,'|' ORDER BY invite_id)) FROM student_invites i) invites`
  )[0];
const metadata = async (q) =>
  (
    await q`SELECT proacl,proowner,prosecdef,proconfig FROM pg_proc WHERE oid='public.save_managed_student(uuid,jsonb,uuid)'::regprocedure`
  )[0];
try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='45s'`;
    await q`SELECT pg_advisory_xact_lock(20261025,25)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    const prerequisite = journal.entries.find((x) => x.idx === 24);
    assert.equal(
      ledger.find((x) => String(x.created_at) === String(prerequisite.when))
        ?.hash,
      createHash("sha256")
        .update(await fs.readFile(new URL(prerequisite.tag + ".sql", root)))
        .digest("hex"),
    );
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
    const before = await fingerprint(q);
    const access = await metadata(q);
    const definition = (
      await q`SELECT pg_get_functiondef('public.save_managed_student(uuid,jsonb,uuid)'::regprocedure) definition`
    )[0].definition;
    await fs.writeFile(
      new URL(
        "../../.vercel/student-edit-function-before.sql",
        import.meta.url,
      ),
      definition + "\n",
    );
    await q.unsafe(source);
    assert.deepEqual(await metadata(q), access, "Function permissions changed");
    assert.deepEqual(await fingerprint(q), before, "Business data changed");
    await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    await q`NOTIFY pgrst,'reload schema'`;
    return {
      at: new Date().toISOString(),
      project: "smbpzlzbvplhtpqggrjf",
      migration: entry.tag,
      hash,
      applied: true,
      businessDataUnchanged: true,
      functionPermissionsUnchanged: true,
    };
  });
  await fs.writeFile(
    new URL("20261025_student_edit_apply.result.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
