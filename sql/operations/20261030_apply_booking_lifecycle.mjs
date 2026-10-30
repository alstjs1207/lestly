import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply"),
  project = "smbpzlzbvplhtpqggrjf";
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
  ),
  entry = journal.entries.find((e) => e.idx === 39);
assert.equal(entry.tag, "0039_booking_lifecycle_integrity");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex"),
  hash = digest(source);
const functions = (q) =>
  q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.prosrc,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`;
async function snapshot(q) {
  const rows = {},
    fingerprints = {};
  for (const {
    tablename: n,
  } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
    assert.match(n, /^[a-z_]+$/);
    rows[n] = (
      await q.unsafe(
        `SELECT to_jsonb(t) row FROM public."${n}" t ORDER BY to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
    fingerprints[n] = {
      count: rows[n].length,
      hash: digest(JSON.stringify(rows[n])),
    };
  }
  return { rows, fingerprints };
}
try {
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261030,39)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const e of journal.entries.filter((e) => e.idx >= 28 && e.idx < 39))
      assert.equal(
        ledger.find((r) => Number(r.created_at) === e.when)?.hash,
        digest(await fs.readFile(new URL(`${e.tag}.sql`, root), "utf8")),
        `Prerequisite ${e.idx}`,
      );
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    if (apply && !installed)
      await q.unsafe(
        `LOCK TABLE ${tables.map((n) => `public."${n}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    const before = await snapshot(q),
      defs = await functions(q),
      policies =
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
      columns =
        await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      triggers =
        await q`SELECT t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.tgname`;
    let backup;
    if (apply && !installed) {
      for (const name of [
        "detach_reassigned_schedule",
        "invalidate_schedule_notices",
      ])
        assert.ok(
          !defs.some((f) => f.proname === name),
          "Unexpected preexisting function",
        );
      backup = `20261030-booking-lifecycle-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url),
        payload =
          JSON.stringify(
            {
              at: new Date().toISOString(),
              project,
              ledger,
              definitions: defs,
              policies,
              columns,
              triggers,
              ...before,
            },
            null,
            2,
          ) + "\n";
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, payload, { flag: "wx", mode: 0o600 });
      assert.equal(await fs.readFile(file, "utf8"), payload);
      for (const part of source.split("--> statement-breakpoint"))
        if (part.trim()) await q.unsafe(part);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
    }
    assert.deepEqual(
      (await snapshot(q)).fingerprints,
      before.fingerprints,
      "Existing business data changed",
    );
    assert.deepEqual(
      await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
      policies,
    );
    assert.deepEqual(
      await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      columns,
    );
    if (apply || installed) {
      const after = await functions(q),
        changed = [
          "guard_schedule_write",
          "update_admin_schedule_batch",
          "on_schedule_delete",
        ];
      for (const f of defs)
        if (!changed.includes(f.proname))
          assert.deepEqual(
            after.find(
              (g) => g.proname === f.proname && g.arguments === f.arguments,
            ),
            f,
            `Unexpected change to ${f.proname}`,
          );
      for (const name of [
        "guard_schedule_write",
        "update_admin_schedule_batch",
        "detach_reassigned_schedule",
        "invalidate_schedule_notices",
      ]) {
        const at = source.indexOf(`FUNCTION public.${name}(`);
        assert.ok(at >= 0);
        assert.equal(
          after.find((f) => f.proname === name).prosrc,
          source.slice(at).split("AS $$")[1].split("$$;")[0],
        );
      }
      assert.ok(
        !after
          .find((f) => f.proname === "on_schedule_delete")
          .prosrc.includes("IF OLD.parent_schedule_id IS NOT NULL THEN"),
      );
      for (const sig of [
        "detach_reassigned_schedule()",
        "invalidate_schedule_notices()",
      ])
        assert.equal(
          (
            await q`SELECT has_function_privilege('authenticated',${"public." + sig},'EXECUTE') allowed`
          )[0].allowed,
          false,
        );
    }
    const anomalies = (
      await q`SELECT count(*) FILTER(WHERE s.parent_schedule_id IS NOT NULL AND p.schedule_id IS NULL)::int missing_roots,count(*) FILTER(WHERE p.student_id IS DISTINCT FROM s.student_id AND p.schedule_id IS NOT NULL)::int mixed_student_parents FROM public.schedules s LEFT JOIN public.schedules p ON p.schedule_id=s.parent_schedule_id`
    )[0];
    return {
      at: new Date().toISOString(),
      project,
      migration: entry.tag,
      hash,
      readOnly: !apply,
      alreadyApplied: !!installed,
      applied: apply || !!installed,
      backup,
      backupVerified: !!backup,
      allBusinessDataUnchanged: true,
      columnsAndPoliciesUnchanged: true,
      counts: Object.fromEntries(
        Object.entries(before.fingerprints).map(([n, v]) => [n, v.count]),
      ),
      anomalies,
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(`20261030_booking_lifecycle_${mode}.result.json`, import.meta.url),
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
