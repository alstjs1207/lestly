// Add the safe RPC first; apply the table lockdown only after both deployed readers use it.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const idx = Number(
  process.argv.find((v) => v.startsWith("--phase="))?.split("=")[1] || 44,
);
assert.ok(idx === 44 || idx === 45);
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url), "utf8"),
);
const project = "smbpzlzbvplhtpqggrjf";
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
assert.ok(
  decodeURIComponent(new URL(env.DATABASE_URL).username).endsWith(
    `.${project}`,
  ),
);
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
);
const entry = journal.entries.find((e) => e.idx === idx);
const digest = (s) => createHash("sha256").update(s).digest("hex");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8"),
  hash = digest(source);
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
async function snapshot(q, tables) {
  const rows = {},
    fingerprints = {};
  for (const name of tables) {
    assert.match(name, /^[a-z_]+$/);
    rows[name] = (
      await q.unsafe(
        `SELECT to_jsonb(t) row FROM public."${name}" t ORDER BY to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
    fingerprints[name] = {
      count: rows[name].length,
      hash: digest(JSON.stringify(rows[name])),
    };
  }
  return { rows, fingerprints };
}
try {
  if (apply && idx === 45) {
    // An unchanged production SELECT * reader would fail after revocation. Do not break it.
    const r = await fetch("https://lestly.io/class/art_mask", {
      redirect: "follow",
    });
    assert.equal(
      r.status,
      200,
      "Production public class must remain available before lockdown",
    );
    const html = await r.text();
    assert.ok(
      !html.includes("push_profile_id"),
      "Production public reader must be on the safe projection before lockdown",
    );
  }
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261105,${idx})`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const previous of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < idx,
    ))
      assert.equal(
        ledger.find((r) => Number(r.created_at) === previous.when)?.hash,
        digest(await fs.readFile(new URL(`${previous.tag}.sql`, root), "utf8")),
        `Prerequisite ${previous.idx}`,
      );
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    if (apply && !installed)
      await q.unsafe(
        `LOCK TABLE ${tables.map((t) => `public."${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    const before = await snapshot(q, tables);
    const acl =
      await q`SELECT relname,relacl FROM pg_class WHERE oid IN ('public.programs'::regclass,'public.instructors'::regclass) ORDER BY relname`;
    const columnAcl =
      await q`SELECT attrelid::regclass::text table_name,attname,attacl FROM pg_attribute WHERE attrelid IN ('public.programs'::regclass,'public.instructors'::regclass) AND attnum>0 AND NOT attisdropped ORDER BY attrelid,attnum`;
    const policies =
      await q`SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('programs','instructors') ORDER BY tablename,policyname`;
    const authGrants =
      await q`SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('programs','instructors') AND grantee IN ('authenticated','service_role') ORDER BY table_name,grantee,privilege_type`;
    const jobs = await q`SELECT to_jsonb(j) row FROM cron.job j ORDER BY jobid`;
    let backup;
    if (apply && !installed) {
      backup = `20261105-public-catalog-${idx}-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      const content =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            migration: entry.tag,
            hash,
            ledger,
            acl,
            columnAcl,
            policies,
            authGrants,
            jobs,
            ...before,
          },
          null,
          2,
        ) + "\n";
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, content, { flag: "wx", mode: 0o600 });
      assert.equal(await fs.readFile(file, "utf8"), content);
      assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
      await q.unsafe(source);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    }
    assert.deepEqual(
      (await snapshot(q, tables)).fingerprints,
      before.fingerprints,
      "Business rows changed",
    );
    assert.deepEqual(
      await q`SELECT to_jsonb(j) row FROM cron.job j ORDER BY jobid`,
      jobs,
      "Scheduler jobs changed",
    );
    assert.deepEqual(
      await q`SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN ('programs','instructors') AND grantee IN ('authenticated','service_role') ORDER BY table_name,grantee,privilege_type`,
      authGrants,
      "Authenticated/service grants changed",
    );
    const afterPolicies =
      await q`SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('programs','instructors') ORDER BY tablename,policyname`;
    const isPublic = (p) =>
      [
        "public-programs-select-policy",
        "public-program-instructor-policy",
        "public-program-instructor-select-policy",
      ].includes(p.policyname);
    assert.deepEqual(
      afterPolicies.filter((p) => !isPublic(p)),
      policies.filter((p) => !isPublic(p)),
      "Unrelated RLS changed",
    );
    const exposure =
      await q`SELECT has_table_privilege('anon','public.programs','SELECT') anon_programs,has_column_privilege('anon','public.instructors','push_profile_id','SELECT') anon_internal_binding,to_regprocedure('public.get_public_program_by_slug(text)') IS NOT NULL safe_rpc`;
    if ((apply || installed) && idx === 45) {
      assert.equal(exposure[0].anon_programs, false);
      assert.equal(exposure[0].anon_internal_binding, false);
      assert.equal(afterPolicies.some(isPublic), false);
    }
    return {
      at: new Date().toISOString(),
      project,
      migration: entry.tag,
      hash,
      readOnly: !apply,
      applied: apply || !!installed,
      alreadyApplied: !!installed,
      backup,
      backupVerified: !!backup,
      existingBusinessRowsUnchanged: true,
      existingJobsUnchanged: true,
      authenticatedServiceGrantsUnchanged: true,
      unrelatedRlsUnchanged: true,
      exposure: exposure[0],
      counts: Object.fromEntries(
        Object.entries(before.fingerprints).map(([n, v]) => [n, v.count]),
      ),
      consultationHistory: {
        count: before.rows.notifications.filter(
          (n) => n.type === "CONSULT_REQUEST",
        ).length,
        hash: digest(
          JSON.stringify(
            before.rows.notifications.filter(
              (n) => n.type === "CONSULT_REQUEST",
            ),
          ),
        ),
      },
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(
      `20261105_public_catalog_${idx}_${mode}.result.json`,
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code || "public_catalog_verification_failed",
      message: String(error.message).split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
