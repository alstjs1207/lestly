// Default is read-only. --apply requires an explicit preview activation request.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const project = "smbpzlzbvplhtpqggrjf";
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url), "utf8"),
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
  await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
);
const entry = journal.entries.find((e) => e.idx === 42);
assert.equal(entry.tag, "0042_secure_consultations");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex");
const hash = digest(source);
async function snapshot(q, tables) {
  const rows = {},
    fingerprints = {};
  for (const name of tables) {
    assert.match(name, /^[a-z_]+$/);
    // New nullable source column does not change the existing event payload.
    const expression =
      name === "push_events"
        ? "to_jsonb(t) - 'notification_id'"
        : "to_jsonb(t)";
    rows[name] = (
      await q.unsafe(
        `SELECT ${expression} row FROM public."${name}" t ORDER BY (${expression})::text`,
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
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261105,42)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const previous of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < 42,
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
    if (apply && !installed) {
      assert.ok(tables.every((t) => /^[a-z_]+$/.test(t)));
      await q.unsafe(
        `LOCK TABLE ${tables.map((t) => `public."${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    const before = await snapshot(q, tables);
    const schema = {
      functions:
        await q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`,
      columns:
        await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      policies:
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
      triggers:
        await q`SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
      constraints:
        await q`SELECT c.relname,x.conname,pg_get_constraintdef(x.oid) definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,x.conname`,
    };
    let backup;
    if (apply && !installed) {
      assert.ok(
        !tables.includes("consult_submission_keys") &&
          !tables.includes("consult_rate_limits"),
        "Unrecorded partial migration",
      );
      backup = `20261105-consult-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            migration: entry.tag,
            hash,
            ledger,
            schema,
            ...before,
          },
          null,
          2,
        ) + "\n";
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      await fs.writeFile(file, payload, { flag: "wx", mode: 0o600 });
      assert.equal(await fs.readFile(file, "utf8"), payload);
      assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
      await q.unsafe(source);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
    }
    assert.deepEqual(
      (await snapshot(q, tables)).fingerprints,
      before.fingerprints,
      "Existing business rows changed",
    );
    if (apply || installed) {
      const grants = (
        await q`SELECT has_table_privilege('anon','public.notifications','INSERT') anon_insert,has_table_privilege('authenticated','public.consult_submission_keys','SELECT') client_keys,has_function_privilege('authenticated','public.submit_public_consultation(bigint,text,text,text,uuid,text,text)','EXECUTE') client_submit`
      )[0];
      assert.deepEqual(grants, {
        anon_insert: false,
        client_keys: false,
        client_submit: false,
      });
      const definition = (
        await q`SELECT pg_get_functiondef('public.on_consult_request_insert()'::regprocedure) definition`
      )[0].definition;
      assert.ok(
        definition.includes("in_app_notifications") &&
          definition.includes("CONSULT_PENDING") &&
          !definition.includes("'ALIMTALK'"),
      );
      assert.equal(
        (
          await q`SELECT count(*)::int count FROM cron.job WHERE jobname='consult-push-retry-job'`
        )[0].count,
        1,
      );
      if (!installed)
        for (const name of ["consult_rate_limits", "consult_submission_keys"])
          assert.equal(
            (
              await q.unsafe(`SELECT count(*)::int count FROM public.${name}`)
            )[0].count,
            0,
          );
    }
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
      existingBusinessRowsUnchanged: true,
      counts: Object.fromEntries(
        Object.entries(before.fingerprints).map(([name, value]) => [
          name,
          value.count,
        ]),
      ),
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(
      `20261105_consult_push_security_${mode}.result.json`,
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code || "consult_migration_verification_failed",
      message: String(error.message).split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
