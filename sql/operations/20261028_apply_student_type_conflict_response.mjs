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
const migration = journal.entries.find((e) => e.idx === 31);
const source = await fs.readFile(new URL(`${migration.tag}.sql`, root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const old = await fs.readFile(
  new URL("0030_organization_student_types.sql", root),
  "utf8",
);
const fnBody = (text) =>
  text
    .slice(text.indexOf("FUNCTION public.save_student_types("))
    .split("AS $$")[1]
    .split("$$;")[0];
const fingerprint = async (q) => {
  const result = {};
  for (const {
    tablename,
  } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
    assert.match(tablename, /^[a-z_]+$/);
    result[tablename] = (
      await q.unsafe(
        `SELECT count(*)::int count,md5(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text)) hash FROM public."${tablename}" t`,
      )
    )[0];
  }
  return result;
};
try {
  const result = await db.begin(async (q) => {
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='30s'`;
    await q`SELECT pg_advisory_xact_lock(20261028,31)`;
    const prerequisite = journal.entries.find((e) => e.idx === 30);
    assert.equal(
      (
        await q`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${prerequisite.when}`
      )[0]?.hash,
      createHash("sha256").update(old).digest("hex"),
    );
    const installed = (
      await q`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${migration.when}`
    )[0];
    if (installed) assert.equal(installed.hash, hash);
    const [before] =
      await q`SELECT pg_get_functiondef(oid) definition,prosrc,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.save_student_types(uuid,jsonb,jsonb)'::regprocedure`;
    assert.equal(before.prosrc, fnBody(installed ? source : old));
    const data = await fingerprint(q);
    if (!installed) {
      await fs.writeFile(
        new URL(
          "../../.vercel/backups/20261028-student-type-conflict-function-before.json",
          import.meta.url,
        ),
        JSON.stringify(before, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      await q.unsafe(source);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${migration.when})`;
    }
    const [after] =
      await q`SELECT prosrc,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.save_student_types(uuid,jsonb,jsonb)'::regprocedure`;
    assert.equal(after.prosrc, fnBody(source));
    for (const key of ["proacl", "prosecdef", "proconfig"])
      assert.deepEqual(after[key], before[key]);
    assert.deepEqual(await fingerprint(q), data);
    return {
      at: new Date().toISOString(),
      project: "smbpzlzbvplhtpqggrjf",
      migration: migration.tag,
      hash,
      applied: true,
      alreadyApplied: !!installed,
      dataUnchanged: true,
      privilegesUnchanged: true,
      conflictSqlstate: "PT409",
    };
  });
  await fs.writeFile(
    new URL(
      "20261028_student_type_conflict_response_apply.result.json",
      import.meta.url,
    ),
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
