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
const entry = journal.entries.find((e) => e.idx === 33),
  previous = journal.entries.find((e) => e.idx === 32);
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fingerprint = async (q) => {
  const data = {};
  for (const {
    tablename,
  } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
    assert.match(tablename, /^[a-z_]+$/);
    data[tablename] = (
      await q.unsafe(
        `SELECT count(*)::int count,md5(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text)) hash FROM public."${tablename}" t`,
      )
    )[0];
  }
  return data;
};
try {
  const result = await db.begin(async (q) => {
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='30s'`;
    await q`SELECT pg_advisory_xact_lock(20261029,33)`;
    assert.equal(
      (
        await q`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${previous.when}`
      )[0]?.hash,
      hash(await fs.readFile(new URL(`${previous.tag}.sql`, root), "utf8")),
    );
    assert.equal(
      (
        await q`SELECT count(*)::int n FROM drizzle.__drizzle_migrations WHERE created_at>${entry.when}`
      )[0].n,
      0,
    );
    const installed = (
      await q`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${entry.when}`
    )[0];
    if (installed) assert.equal(installed.hash, hash(source));
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    await q.unsafe(
      `LOCK TABLE ${tables.map((t) => `public."${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const before =
      await q`SELECT proname,prosrc,proacl,proconfig,prosecdef,provolatile,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid IN ('public.schedule_peak_occupancy(uuid,timestamptz,timestamptz,bigint[])'::regprocedure,'public.read_booking_policy(uuid)'::regprocedure) ORDER BY proname`;
    const data = await fingerprint(q);
    if (!installed) {
      assert.ok(before.every((f) => f.provolatile === "s"));
      await fs.writeFile(
        new URL(
          "../../.vercel/backups/20261029-booking-snapshot-functions-before.json",
          import.meta.url,
        ),
        JSON.stringify(before, null, 2) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      await q.unsafe(source);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash(source)},${entry.when})`;
    }
    const after =
      await q`SELECT proname,prosrc,proacl,proconfig,prosecdef,provolatile FROM pg_proc WHERE oid IN ('public.schedule_peak_occupancy(uuid,timestamptz,timestamptz,bigint[])'::regprocedure,'public.read_booking_policy(uuid)'::regprocedure) ORDER BY proname`;
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i].provolatile, "v");
      for (const key of [
        "proname",
        "prosrc",
        "proacl",
        "proconfig",
        "prosecdef",
      ])
        assert.deepEqual(after[i][key], before[i][key]);
    }
    assert.deepEqual(await fingerprint(q), data);
    return {
      at: new Date().toISOString(),
      project: "smbpzlzbvplhtpqggrjf",
      migration: entry.tag,
      hash: hash(source),
      applied: true,
      alreadyApplied: !!installed,
      dataUnchanged: true,
      functionBodiesAndPrivilegesUnchanged: true,
      helpersUseFreshSnapshots: true,
    };
  });
  await fs.writeFile(
    new URL("20261029_booking_snapshot_apply.result.json", import.meta.url),
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
