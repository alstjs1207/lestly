// Default read-only; applying enables deletion but never deletes business records.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply"),
  project = "smbpzlzbvplhtpqggrjf";
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url), "utf8"),
);
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
assert.ok(
  decodeURIComponent(new URL(env.DATABASE_URL).username).endsWith(
    `.${project}`,
  ),
);
const root = new URL("../migrations/", import.meta.url),
  journal = JSON.parse(
    await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
  ),
  entry = journal.entries.find((e) => e.idx === 46);
assert.equal(entry.tag, "0046_consultation_delete");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8"),
  digest = (s) => createHash("sha256").update(s).digest("hex"),
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
async function grants(q) {
  return q`SELECT table_name,grantee,privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY table_name,grantee,privilege_type,is_grantable`;
}
async function policies(q) {
  return q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
}
try {
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261105,46)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const previous of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < 46,
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
    const before = await snapshot(q, tables),
      beforePolicies = await policies(q),
      beforeGrants = await grants(q);
    const jobs = await q`SELECT to_jsonb(j) row FROM cron.job j ORDER BY jobid`;
    const beforeFks =
      await q`SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.consult_submission_keys'::regclass ORDER BY conname`;
    let backup;
    if (apply && !installed) {
      backup = `20261105-consult-delete-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url),
        content =
          JSON.stringify(
            {
              at: new Date().toISOString(),
              project,
              migration: entry.tag,
              hash,
              ledger,
              policies: beforePolicies,
              grants: beforeGrants,
              keysConstraints: beforeFks,
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
      "Cron changed",
    );
    const ignoreDelete = (g) =>
      !(
        g.table_name === "notifications" &&
        g.grantee === "authenticated" &&
        g.privilege_type === "DELETE"
      );
    assert.deepEqual(
      (await grants(q)).filter(ignoreDelete),
      beforeGrants.filter(ignoreDelete),
      "Unrelated grants changed",
    );
    const isDelete = (p) =>
      p.tablename === "notifications" &&
      p.policyname === "org_admin_delete_consult_notifications";
    const afterPolicies = await policies(q);
    assert.deepEqual(
      afterPolicies.filter((p) => !isDelete(p)),
      beforePolicies.filter((p) => !isDelete(p)),
      "Unrelated policies changed",
    );
    const state = (
      await q`SELECT (SELECT confdeltype='n' FROM pg_constraint WHERE conrelid='public.consult_submission_keys'::regclass AND conname='consult_submission_keys_notification_id_fkey') tombstone_fk,(SELECT NOT attnotnull FROM pg_attribute WHERE attrelid='public.consult_submission_keys'::regclass AND attname='notification_id') tombstone_nullable,has_table_privilege('authenticated','public.notifications','DELETE') authenticated_delete,has_table_privilege('anon','public.notifications','DELETE') anonymous_delete`
    )[0];
    if (apply || installed) {
      assert.equal(state.tombstone_fk, true);
      assert.equal(state.tombstone_nullable, true);
      assert.equal(state.authenticated_delete, true);
      assert.equal(state.anonymous_delete, false);
      assert.equal(afterPolicies.filter(isDelete).length, 1);
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
      unrelatedGrantsAndPoliciesUnchanged: true,
      state,
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
    new URL(`20261105_consult_delete_${mode}.result.json`, import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code || "consult_delete_verification_failed",
      message: String(error.message).split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
