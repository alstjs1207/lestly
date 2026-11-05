// Default is read-only. --apply removes only the consultation retry job/URL.
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
const entry = journal.entries.find((e) => e.idx === 43);
assert.equal(entry.tag, "0043_consult_immediate_push_only");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex");
const hash = digest(source);
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
  const result = await db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261105,43)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const previous of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < 43,
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
    const jobs = await q`SELECT to_jsonb(j) row FROM cron.job j ORDER BY jobid`;
    const urls =
      await q`SELECT id,decrypted_secret FROM vault.decrypted_secrets WHERE name='lestly_consult_push_app_url'`;
    assert.ok(urls.length <= 1);
    if (urls.length)
      assert.equal(urls[0].decrypted_secret, "https://lestly.vercel.app");
    const bypass = (
      await q`SELECT count(*)::int n FROM vault.decrypted_secrets WHERE name='lestly_consult_push_bypass_secret'`
    )[0].n;
    assert.equal(
      bypass,
      0,
      "Unexpected consultation bypass credential; do not delete unrelated credentials",
    );
    const consultationRows =
      await q`SELECT to_jsonb(n) row FROM public.notifications n WHERE type='CONSULT_REQUEST' ORDER BY notification_id`;
    const consultationHistory = {
      count: consultationRows.length,
      hash: digest(JSON.stringify(consultationRows.map((r) => r.row))),
    };
    let backup,
      removedRetryUrl = false;
    if (apply && !installed) {
      backup = `20261105-consult-immediate-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            migration: entry.tag,
            hash,
            ledger,
            jobs,
            consultationRetryUrl: urls,
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
      removedRetryUrl =
        (
          await q`DELETE FROM vault.secrets WHERE name='lestly_consult_push_app_url' RETURNING id`
        ).length > 0;
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
    }
    const afterJobs =
      await q`SELECT to_jsonb(j) row FROM cron.job j ORDER BY jobid`;
    const withoutConsult = (rows) =>
      rows.filter((r) => r.row.jobname !== "consult-push-retry-job");
    assert.deepEqual(
      withoutConsult(afterJobs),
      withoutConsult(jobs),
      "Unrelated cron jobs changed",
    );
    assert.deepEqual(
      (await snapshot(q, tables)).fingerprints,
      before.fingerprints,
      "Business data changed",
    );
    if (apply || installed) {
      assert.equal(
        afterJobs.some((r) => r.row.jobname === "consult-push-retry-job"),
        false,
      );
      assert.equal(
        (
          await q`SELECT count(*)::int n FROM vault.decrypted_secrets WHERE name='lestly_consult_push_app_url'`
        )[0].n,
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
      removedRetryUrl,
      consultationRetryJobPresent: afterJobs.some(
        (r) => r.row.jobname === "consult-push-retry-job",
      ),
      consultationRetryUrlPresent: apply || installed ? false : urls.length > 0,
      bypassKeyPresent: false,
      existingBusinessRowsUnchanged: true,
      existingScheduleAndOtherJobsUnchanged: true,
      consultationHistory,
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
    new URL(
      `20261105_consult_push_immediate_${mode}.result.json`,
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      code: error.code || "consult_immediate_verification_failed",
      message: String(error.message).split("\n")[0],
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
