// Read-only comparison against the private, pre-migration backup.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
const project = "smbpzlzbvplhtpqggrjf";
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const backup = JSON.parse(
  await fs.readFile(
    new URL(
      "../../.vercel/backups/20261029-booking-policy-before-1793231250994.json",
      import.meta.url,
    ),
  ),
);
assert.equal(backup.project, project);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
try {
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    await q`SET LOCAL statement_timeout='30s'`;
    const counts = {};
    const names = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    assert.deepEqual(names, Object.keys(backup.fingerprints).sort());
    for (const name of names) {
      assert.match(name, /^[a-z_]+$/);
      const rows = (
        await q.unsafe(
          `SELECT to_jsonb(t) row FROM public."${name}" t ORDER BY to_jsonb(t)::text`,
        )
      ).map((r) => r.row);
      assert.deepEqual(
        { count: rows.length, hash: digest(JSON.stringify(rows)) },
        backup.fingerprints[name],
        `Existing data changed: ${name}`,
      );
      counts[name] = rows.length;
    }
    const root = new URL("../migrations/", import.meta.url);
    const journal = JSON.parse(
      await fs.readFile(new URL("meta/_journal.json", root)),
    );
    const migrations = [];
    for (const idx of [32, 33]) {
      const entry = journal.entries.find((e) => e.idx === idx);
      const hash = digest(await fs.readFile(new URL(`${entry.tag}.sql`, root)));
      const [installed] =
        await q`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=${entry.when}`;
      assert.equal(installed?.hash, hash);
      migrations.push({ tag: entry.tag, hash });
    }
    return {
      at: new Date().toISOString(),
      project,
      migrations,
      businessDataMatchesPreMigrationBackup: true,
      counts,
    };
  });
  await fs.writeFile(
    new URL(
      "20261029_booking_deployment_postflight.result.json",
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.end({ timeout: 5 });
}
