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
const url = new URL(env.DATABASE_URL);
assert.equal(url.hostname, "aws-1-ap-northeast-2.pooler.supabase.com");
assert.ok(decodeURIComponent(url.username).endsWith(`.${project}`));
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const root = new URL("../migrations/", import.meta.url),
  journal = JSON.parse(await fs.readFile(new URL("meta/_journal.json", root))),
  entry = journal.entries.find((e) => e.idx === 38);
assert.equal(entry.tag, "0038_settings_section_saves");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8"),
  digest = (s) => createHash("sha256").update(s).digest("hex"),
  hash = digest(source);
const functions = (q) =>
  q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.prosrc,p.proacl,p.prosecdef,p.proconfig,p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`;
async function snapshot(q) {
  const rows = {},
    fingerprints = {};
  for (const {
    tablename: name,
  } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
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
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261030,38)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const e of journal.entries.filter((e) => e.idx >= 28 && e.idx < 38))
      assert.equal(
        ledger.find((r) => Number(r.created_at) === e.when)?.hash,
        digest(await fs.readFile(new URL(`${e.tag}.sql`, root), "utf8")),
        `Prerequisite ${e.idx}`,
      );
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    const before = await snapshot(q),
      defs = await functions(q),
      policies =
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
    if (!installed)
      assert.ok(
        !defs.some((f) => f.proname === "save_booking_settings_section"),
        "Unexpected existing RPC",
      );
    let backup;
    if (apply && !installed) {
      backup = `20261030-settings-sections-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            ledger,
            definitions: defs,
            policies,
            ...before,
          },
          null,
          2,
        ) + "\n";
      await fs.writeFile(file, payload, { mode: 0o600, flag: "wx" });
      assert.equal(await fs.readFile(file, "utf8"), payload);
      await q.unsafe(source);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    }
    if (apply || installed) {
      const after = await functions(q);
      for (const f of defs)
        assert.deepEqual(
          after.find(
            (g) => g.proname === f.proname && g.arguments === f.arguments,
          ),
          f,
          `Existing function changed: ${f.proname}`,
        );
      const fn = after.find(
        (f) => f.proname === "save_booking_settings_section",
      );
      assert.equal(fn.prosrc, source.split("AS $$")[1].split("$$;")[0]);
      assert.equal(fn.prosecdef, true);
      assert.ok(fn.proconfig.some((v) => v.startsWith("search_path=")));
      assert.deepEqual(
        (
          await q`SELECT has_function_privilege('anon','public.save_booking_settings_section(uuid,text,jsonb)','EXECUTE') anonymous,has_function_privilege('authenticated','public.save_booking_settings_section(uuid,text,jsonb)','EXECUTE') authenticated`
        )[0],
        { anonymous: false, authenticated: true },
      );
    }
    assert.deepEqual(
      (await snapshot(q)).fingerprints,
      before.fingerprints,
      "Business data changed",
    );
    assert.deepEqual(
      await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
      policies,
    );
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
      existingFunctionsAndPoliciesUnchanged: true,
      counts: Object.fromEntries(
        Object.entries(before.fingerprints).map(([n, v]) => [n, v.count]),
      ),
    };
  });
  const mode = apply
    ? "apply"
    : result.alreadyApplied
      ? "postflight"
      : "preflight";
  await fs.writeFile(
    new URL(`20261030_settings_sections_${mode}.result.json`, import.meta.url),
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
