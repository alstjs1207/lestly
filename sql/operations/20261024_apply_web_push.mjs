import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const mode = process.argv[2] ?? "preflight";
assert.ok(["preflight", "apply"].includes(mode), "Use preflight or apply");
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
const project = "smbpzlzbvplhtpqggrjf";
const appUrl = "https://lestly.io";
assert.equal(new URL(env.SUPABASE_URL).hostname, `${project}.supabase.co`);
const connection = new URL(env.DATABASE_URL);
assert.equal(connection.hostname, "aws-1-ap-northeast-2.pooler.supabase.com");
assert.ok(decodeURIComponent(connection.username).endsWith(`.${project}`));
assert.ok(env.CRON_SECRET?.trim(), "CRON_SECRET is required");
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const root = new URL("../migrations/", import.meta.url);
const journal = JSON.parse(
  await fs.readFile(new URL("meta/_journal.json", root), "utf8"),
);
const entry = journal.entries.find((item) => item.idx === 23);
assert.equal(entry.tag, "0023_instructor_web_push");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const hash = createHash("sha256").update(source).digest("hex");
const fingerprint = async (q) =>
  (
    await q`SELECT
  (SELECT count(*)::int FROM public.profiles) profiles,
  (SELECT count(*)::int FROM public.organization_members) memberships,
  (SELECT count(*)::int FROM public.schedules) schedules,
  (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY profile_id)) FROM public.profiles p) profile_hash,
  (SELECT md5(string_agg(to_jsonb(m)::text,'|' ORDER BY organization_id,profile_id)) FROM public.organization_members m) membership_hash,
  (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY schedule_id)) FROM public.schedules s) schedule_hash,
  (SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY program_id)) FROM public.programs p) program_hash,
  (SELECT md5(string_agg((to_jsonb(i)-'push_profile_id')::text,'|' ORDER BY instructor_id)) FROM public.instructors i) instructor_hash,
  (SELECT md5(string_agg(to_jsonb(s)::text,'|' ORDER BY organization_id,setting_key)) FROM public.settings s) settings_hash`
  )[0];

try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='30s'`;
    await q`SELECT pg_advisory_xact_lock(20261024,23)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    for (const index of [16, 17, 18, 19, 20, 21, 22]) {
      const previous = journal.entries.find((item) => item.idx === index);
      const expected = createHash("sha256")
        .update(await fs.readFile(new URL(`${previous.tag}.sql`, root)))
        .digest("hex");
      assert.equal(
        ledger.find((item) => String(item.created_at) === String(previous.when))
          ?.hash,
        expected,
        `Prerequisite ${index} is missing or changed`,
      );
    }
    assert.ok(
      ledger.every((item) => Number(item.created_at) <= entry.when),
      "A newer migration requires review",
    );
    const previous = ledger.find(
      (item) => String(item.created_at) === String(entry.when),
    );
    if (previous) assert.equal(previous.hash, hash, "Migration hash mismatch");
    const before = await fingerprint(q);
    const priorJobs =
      await q`SELECT jobname,schedule,active,md5(command) fingerprint FROM cron.job WHERE jobname <> 'web-push-retry-job' ORDER BY jobname`;
    assert.ok(
      (await q`SELECT to_regclass('vault.decrypted_secrets') present`)[0]
        .present,
      "Supabase Vault is required",
    );
    if (mode === "apply" && !previous) {
      for (const [name, value] of [
        ["lestly_web_push_app_url", appUrl],
        ["lestly_web_push_cron_secret", env.CRON_SECRET],
      ]) {
        const existing =
          await q`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=${name}`;
        assert.ok(existing.length <= 1, "Duplicate push cron secret");
        if (existing.length)
          assert.equal(
            existing[0].decrypted_secret,
            value,
            "Push cron setting mismatch",
          );
        else
          await q`SELECT vault.create_secret(${value},${name},'Lestly independent Web Push retry worker')`;
      }
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await q.unsafe(statement);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`NOTIFY pgrst, 'reload schema'`;
    }
    const applied = !!previous || mode === "apply";
    let verification = null;
    if (applied) {
      const tables = await q`SELECT c.relname,c.relrowsecurity,
        has_table_privilege('anon',c.oid,'SELECT') anon_read,
        has_table_privilege('authenticated',c.oid,'SELECT') client_read,
        has_table_privilege('authenticated',c.oid,'INSERT') client_insert,
        has_table_privilege('service_role',c.oid,'SELECT') worker_read
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('push_subscriptions','push_events','push_deliveries') ORDER BY c.relname`;
      assert.equal(tables.length, 3);
      for (const table of tables) {
        assert.equal(table.relrowsecurity, true);
        assert.equal(table.anon_read, false);
        assert.equal(table.client_read, false);
        assert.equal(table.client_insert, false);
        assert.equal(table.worker_read, true);
      }
      const triggers =
        await q`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('check_instructor_push_account','enqueue_instructor_schedule_push') ORDER BY tgname`;
      assert.equal(triggers.length, 2);
      const [job] =
        await q`SELECT schedule,active,command FROM cron.job WHERE jobname='web-push-retry-job'`;
      assert.equal(job.schedule, "* * * * *");
      assert.equal(job.active, true);
      assert.ok(job.command.includes("vault.decrypted_secrets"));
      assert.ok(job.command.includes("/api/cron/push"));
      const secrets =
        await q`SELECT name,decrypted_secret FROM vault.decrypted_secrets WHERE name IN ('lestly_web_push_app_url','lestly_web_push_cron_secret')`;
      assert.equal(
        secrets.find((secret) => secret.name === "lestly_web_push_app_url")
          ?.decrypted_secret,
        appUrl,
      );
      assert.equal(
        secrets.find((secret) => secret.name === "lestly_web_push_cron_secret")
          ?.decrypted_secret,
        env.CRON_SECRET,
      );
      verification = {
        tables,
        triggers,
        cron: {
          schedule: job.schedule,
          active: job.active,
          secretsInVault: true,
        },
        counts: (
          await q`SELECT
        (SELECT count(*)::int FROM push_subscriptions) subscriptions,
        (SELECT count(*)::int FROM push_events) events,
        (SELECT count(*)::int FROM push_deliveries) deliveries`
        )[0],
      };
    }
    assert.deepEqual(
      await fingerprint(q),
      before,
      "Business data changed during migration",
    );
    assert.deepEqual(
      await q`SELECT jobname,schedule,active,md5(command) fingerprint FROM cron.job WHERE jobname <> 'web-push-retry-job' ORDER BY jobname`,
      priorJobs,
      "Existing message cron jobs changed",
    );
    return {
      mode,
      project,
      appUrl,
      at: new Date().toISOString(),
      migration: entry.tag,
      hash,
      alreadyApplied: !!previous,
      applied,
      businessDataUnchanged: true,
      existingCronJobsUnchanged: true,
      counts: {
        profiles: before.profiles,
        memberships: before.memberships,
        schedules: before.schedules,
      },
      verification,
    };
  });
  const label =
    mode === "preflight" && result.alreadyApplied ? "postflight" : mode;
  await fs.writeFile(
    new URL(`20261024_web_push_${label}.result.json`, import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({ code: error.code ?? null, message: error.message }),
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
