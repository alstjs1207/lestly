import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const project = "smbpzlzbvplhtpqggrjf";
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const connection = new URL(env.DATABASE_URL);
assert.equal(connection.hostname, "aws-1-ap-northeast-2.pooler.supabase.com");
assert.ok(decodeURIComponent(connection.username).endsWith(`.${project}`));
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root)),
);
const entry = journal.entries.find((item) => item.idx === 28);
assert.equal(entry.tag, "0028_student_booking_weekdays");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const previous = journal.entries.find((item) => item.idx === 27);
const baseline = await fs.readFile(
  new URL(`${previous.tag}.sql`, root),
  "utf8",
);
const previousHash = createHash("sha256").update(baseline).digest("hex");
const names = ["guard_schedule_write", "get_student_booking_availability"];
const body = (text, name) =>
  text
    .slice(text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`))
    .split("AS $$")[1]
    .split("$$;")[0];
const definitions = (
  q,
) => q`SELECT p.proname, p.prosrc, pg_get_functiondef(p.oid) definition,
  p.proacl, p.prosecdef, p.proconfig, p.provolatile
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('guard_schedule_write','get_student_booking_availability')
  ORDER BY p.proname`;
const fingerprint = async (q) => {
  const result = {};
  for (const [table, key] of [
    ["profiles", "profile_id"],
    ["organization_members", "organization_id,profile_id"],
    ["schedules", "schedule_id"],
    ["programs", "program_id"],
    ["instructors", "instructor_id"],
    ["settings", "organization_id,setting_key"],
    ["notifications", "notification_id"],
    ["student_invites", "invite_id"],
    ["attendance_events", "event_id"],
  ]) {
    // Identifiers are fixed above; no user data is interpolated.
    result[table] = (
      await q.unsafe(`SELECT count(*)::integer AS count,
      md5(string_agg(to_jsonb(t)::text,'|' ORDER BY ${key})) AS hash FROM public.${table} t`)
    )[0];
  }
  return result;
};

try {
  const result = await db.begin(async (q) => {
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    else await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='30s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261027,28)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.equal(
      ledger.find((row) => Number(row.created_at) === previous.when)?.hash,
      previousHash,
      "Prerequisite 0027 mismatch",
    );
    assert.ok(
      ledger.every((row) => Number(row.created_at) <= entry.when),
      "Unexpected newer migration",
    );
    const applied = ledger.find((row) => Number(row.created_at) === entry.when);
    if (applied)
      assert.equal(applied.hash, hash, "Applied migration hash mismatch");
    const beforeDefinitions = await definitions(q);
    assert.equal(beforeDefinitions.length, 2);
    for (const name of names)
      assert.equal(
        beforeDefinitions.find((fn) => fn.proname === name).prosrc,
        body(applied ? source : baseline, name),
        `Remote ${name} differs from expected source`,
      );
    const before = await fingerprint(q);
    if (apply && !applied) {
      await fs.writeFile(
        new URL(
          "../../.vercel/booking-weekdays-schema-before.json",
          import.meta.url,
        ),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            definitions: beforeDefinitions,
            policies:
              await q`SELECT policyname,qual FROM pg_policies WHERE schemaname='public' AND tablename='settings'`,
          },
          null,
          2,
        ) + "\n",
      );
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await q.unsafe(statement);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`NOTIFY pgrst,'reload schema'`;
    }
    if (apply || applied) {
      const afterDefinitions = await definitions(q);
      for (const name of names) {
        const fn = afterDefinitions.find((item) => item.proname === name);
        assert.equal(fn.prosrc, body(source, name));
        const attributes = ({ proacl, prosecdef, proconfig, provolatile }) => ({
          proacl,
          prosecdef,
          proconfig,
          provolatile,
        });
        assert.deepEqual(
          attributes(fn),
          attributes(beforeDefinitions.find((item) => item.proname === name)),
          "Function privileges changed",
        );
      }
      const policies =
        await q`SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='settings' AND policyname='public-select-org-settings-policy'`;
      assert.ok(policies[0]?.qual.includes("disabled_booking_weekdays"));
    }
    assert.deepEqual(
      await fingerprint(q),
      before,
      "Existing business data changed",
    );
    return {
      at: new Date().toISOString(),
      project,
      migration: entry.tag,
      hash,
      readOnly: !apply,
      alreadyApplied: !!applied,
      applied: apply || !!applied,
      prerequisitesVerified: true,
      businessDataUnchanged: true,
      counts: Object.fromEntries(
        Object.entries(before).map(([table, value]) => [table, value.count]),
      ),
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(`20261027_booking_weekdays_${mode}.result.json`, import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
