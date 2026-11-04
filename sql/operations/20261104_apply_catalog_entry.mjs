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
const entry = journal.entries.find((e) => e.idx === 41);
assert.equal(entry.tag, "0041_public_program_slug");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex");
const hash = digest(source);
const constraintName = "programs_public_slug_check";
const normalize = (value) => value.replace(/\s|\(|\)|::text/g, "");
const expected = normalize(
  "CHECK (is_public IS NOT TRUE OR (slug IS NOT NULL AND slug ~ '[^[:space:]]')) NOT VALID",
);

async function business(q) {
  const rows = {},
    fingerprints = {};
  for (const {
    tablename,
  } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
    assert.match(tablename, /^[a-z_]+$/);
    rows[tablename] = (
      await q.unsafe(
        `SELECT to_jsonb(t) row FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
    fingerprints[tablename] = {
      count: rows[tablename].length,
      hash: digest(JSON.stringify(rows[tablename])),
    };
  }
  return { rows, fingerprints };
}
async function schema(q) {
  return {
    functions:
      await q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`,
    columns:
      await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
    policies:
      await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
    indexes:
      await q`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
    triggers:
      await q`SELECT c.relname table_name,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
    constraints:
      await q`SELECT c.relname table_name,x.conname,x.contype,x.convalidated,pg_get_constraintdef(x.oid) definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,x.conname`,
  };
}
try {
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261104,41)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const previous of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < 41,
    )) {
      assert.equal(
        ledger.find((r) => Number(r.created_at) === previous.when)?.hash,
        digest(await fs.readFile(new URL(`${previous.tag}.sql`, root), "utf8")),
        `Prerequisite ${previous.idx}`,
      );
    }
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    if (apply && !installed) {
      const tables = (
        await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
      ).map((r) => r.tablename);
      assert.ok(tables.every((name) => /^[a-z_]+$/.test(name)));
      await q.unsafe(
        `LOCK TABLE ${tables.map((name) => `public."${name}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    const before = await business(q),
      beforeSchema = await schema(q);
    const existing = beforeSchema.constraints.filter(
      (c) => c.table_name === "programs" && c.conname === constraintName,
    );
    assert.equal(
      existing.length,
      installed ? 1 : 0,
      "Constraint and migration ledger disagree",
    );
    let backup;
    if (apply && !installed) {
      backup = `20261104-catalog-entry-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            migration: entry.tag,
            sourceHash: hash,
            ledger,
            schema: beforeSchema,
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
    const afterSchema = await schema(q);
    assert.deepEqual(
      (await business(q)).fingerprints,
      before.fingerprints,
      "Business data changed",
    );
    for (const key of [
      "functions",
      "columns",
      "policies",
      "indexes",
      "triggers",
    ])
      assert.deepEqual(
        afterSchema[key],
        beforeSchema[key],
        `Unexpected ${key} change`,
      );
    const withoutNew = (constraints) =>
      constraints.filter(
        (c) => !(c.table_name === "programs" && c.conname === constraintName),
      );
    assert.deepEqual(
      withoutNew(afterSchema.constraints),
      withoutNew(beforeSchema.constraints),
      "Existing constraints changed",
    );
    if (apply || installed) {
      const added = afterSchema.constraints.filter(
        (c) => c.table_name === "programs" && c.conname === constraintName,
      );
      assert.equal(added.length, 1);
      assert.equal(added[0].contype, "c");
      assert.equal(added[0].convalidated, false);
      assert.equal(
        normalize(added[0].definition),
        expected,
        "Unexpected public slug constraint",
      );
    }
    const publicState = (
      await q`SELECT count(*)::int classes,count(*) FILTER(WHERE is_public IS TRUE)::int public_classes,count(*) FILTER(WHERE is_public IS TRUE AND (slug IS NULL OR slug !~ '[^[:space:]]'))::int legacy_public_without_slug FROM public.programs`
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
      existingSchemaAndPermissionsUnchanged: true,
      counts: Object.fromEntries(
        Object.entries(before.fingerprints).map(([name, value]) => [
          name,
          value.count,
        ]),
      ),
      publicState,
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(`20261104_catalog_entry_${mode}.result.json`, import.meta.url),
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
