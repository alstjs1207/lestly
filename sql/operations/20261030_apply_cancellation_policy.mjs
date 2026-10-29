import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const project = "smbpzlzbvplhtpqggrjf";
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
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
  await fs.readFile(new URL("meta/_journal.json", root)),
);
const entry = journal.entries.find((e) => e.idx === 35);
assert.equal(entry.tag, "0035_cancellation_policy");
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex");
const hash = digest(source);
const replaced = { guard_booking_settings: 34 };
const created = [
  "validate_cancellation_policy",
  "read_cancellation_policy",
  "cancellation_allowed",
  "stamp_schedule_cancellation",
  "book_student_schedule_with_policy",
];
const functionBody = (text, name) => {
  const start = text.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\(`),
  );
  assert.ok(start >= 0, `Missing source definition: ${name}`);
  return text.slice(start).split("AS $$")[1].split("$$;")[0];
};
const definitions = (
  q,
) => q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,
  pg_get_functiondef(p.oid) definition,p.prosrc,p.proacl,p.prosecdef,p.proconfig,p.provolatile
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`;
const snapshot = async (q, tables) => {
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
      hash: digest(
        JSON.stringify(
          rows[name]
            .map((row) => {
              if (name !== "schedules") return row;
              const { cancellation_policy, ...original } = row;
              return original;
            })
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ),
      ),
    };
  }
  return { rows, fingerprints };
};
try {
  const result = await db.begin(async (q) => {
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261030,35)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const idx of [28, 29, 30, 31, 32, 33, 34]) {
      const prerequisite = journal.entries.find((e) => e.idx === idx);
      const sql = await fs.readFile(
        new URL(`${prerequisite.tag}.sql`, root),
        "utf8",
      );
      assert.equal(
        ledger.find((r) => Number(r.created_at) === prerequisite.when)?.hash,
        digest(sql),
        `Prerequisite ${idx} hash mismatch`,
      );
    }
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    const beforeDefinitions = await definitions(q);
    for (const [name, idx] of Object.entries(replaced)) {
      const tag = journal.entries.find((e) => e.idx === idx).tag;
      const sql = installed
        ? source
        : await fs.readFile(new URL(`${tag}.sql`, root), "utf8");
      assert.equal(
        beforeDefinitions.find((f) => f.proname === name)?.prosrc,
        functionBody(sql, name),
        `Unexpected remote function: ${name}`,
      );
    }
    if (!installed)
      for (const name of created)
        assert.ok(
          !beforeDefinitions.some((f) => f.proname === name),
          `Unexpected existing function: ${name}`,
        );
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    if (apply && !installed)
      await q.unsafe(
        `LOCK TABLE ${tables.map((t) => `public."${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    const before = await snapshot(q, tables);
    const policies =
      await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
    let backup;
    if (apply && !installed) {
      backup = `20261030-cancellation-policy-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            ledger,
            definitions: beforeDefinitions,
            policies,
            columns:
              await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
            constraints:
              await q`SELECT c.conname,c.conrelid::regclass::text relation,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'`,
            triggers:
              await q`SELECT pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal`,
            ...before,
          },
          null,
          2,
        ) + "\n";
      await fs.writeFile(file, payload, { mode: 0o600, flag: "wx" });
      assert.equal(await fs.readFile(file, "utf8"), payload);
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await q.unsafe(statement);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
      await q`NOTIFY pgrst,'reload schema'`;
    }
    if (apply || installed) {
      const after = await definitions(q);
      for (const name of [...Object.keys(replaced), ...created])
        assert.equal(
          after.find((f) => f.proname === name)?.prosrc,
          functionBody(source, name),
          `Applied function mismatch: ${name}`,
        );
      for (const fn of beforeDefinitions) {
        const match = after.find(
          (f) => f.proname === fn.proname && f.arguments === fn.arguments,
        );
        assert.ok(match, `Existing function removed: ${fn.proname}`);
        if (!Object.hasOwn(replaced, fn.proname))
          assert.deepEqual(
            match,
            fn,
            `Unrelated function changed: ${fn.proname}`,
          );
        else
          for (const key of ["proacl", "prosecdef", "proconfig", "provolatile"])
            assert.deepEqual(
              match[key],
              fn[key],
              `Function attributes changed: ${fn.proname}.${key}`,
            );
      }
      const afterPolicies =
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
      const unrelated = (items) =>
        items.filter(
          (p) =>
            ![
              "public-select-org-settings-policy",
              "student-delete-own-schedules-policy",
            ].includes(p.policyname),
        );
      assert.deepEqual(unrelated(afterPolicies), unrelated(policies));
      assert.ok(
        afterPolicies
          .find((p) => p.policyname === "public-select-org-settings-policy")
          .qual.includes("booking_policy"),
      );
      for (const name of created) {
        const [permission] =
          await q`SELECT has_function_privilege('anon',p.oid,'EXECUTE') anonymous,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=${name}`;
        assert.deepEqual(permission, {
          anonymous: false,
          authenticated: [
            "cancellation_allowed",
            "book_student_schedule_with_policy",
          ].includes(name),
        });
      }
      assert.deepEqual(
        (
          await q`SELECT has_function_privilege('anon','public.get_student_booking_availability_minutes(uuid,date,integer)','EXECUTE') anonymous,has_function_privilege('authenticated','public.get_student_booking_availability_minutes(uuid,date,integer)','EXECUTE') authenticated`
        )[0],
        { anonymous: false, authenticated: true },
      );
      for (const org of before.rows.organizations) {
        await q`SELECT public.validate_booking_policy(public.read_booking_policy(${org.organization_id}))`;
        await q`SELECT public.validate_cancellation_policy(public.read_cancellation_policy(${org.organization_id}))`;
        if (
          !before.rows.settings.some(
            (s) =>
              s.organization_id === org.organization_id &&
              s.setting_key === "cancellation_policy",
          )
        )
          assert.deepEqual(
            (
              await q`SELECT public.read_cancellation_policy(${org.organization_id}) w`
            )[0].w,
            { mode: "previous_day" },
          );
      }
      assert.equal(
        after.find((f) => f.proname === "read_cancellation_policy").provolatile,
        "v",
      );
      assert.ok(
        afterPolicies
          .find((p) => p.policyname === "public-select-org-settings-policy")
          .qual.includes("cancellation_policy"),
      );
      assert.ok(
        afterPolicies
          .find((p) => p.policyname === "student-delete-own-schedules-policy")
          .qual.includes("cancellation_allowed"),
      );
      if (!installed) {
        const snapshots =
          await q`SELECT cancellation_policy,count(*)::int count FROM public.schedules GROUP BY cancellation_policy`;
        for (const row of snapshots)
          assert.deepEqual(row.cancellation_policy, { mode: "previous_day" });
      }
    }
    assert.deepEqual(
      (await snapshot(q, tables)).fingerprints,
      before.fingerprints,
      "Existing business data changed",
    );
    let matchesBackup;
    if (process.argv.includes("--compare-backup")) {
      const applied = JSON.parse(
        await fs.readFile(
          new URL(
            "20261030_cancellation_policy_apply.result.json",
            import.meta.url,
          ),
        ),
      );
      assert.match(
        applied.backup,
        /^20261030-cancellation-policy-before-[0-9]+\.json$/,
      );
      const prior = JSON.parse(
        await fs.readFile(
          new URL(`../../.vercel/backups/${applied.backup}`, import.meta.url),
        ),
      );
      assert.equal(prior.project, project);
      assert.deepEqual(
        before.fingerprints,
        prior.fingerprints,
        "Business data differs from pre-migration backup",
      );
      matchesBackup = true;
    }
    return {
      businessDataMatchesPreMigrationBackup: matchesBackup,
      at: new Date().toISOString(),
      project,
      migration: entry.tag,
      hash,
      readOnly: !apply,
      alreadyApplied: !!installed,
      applied: apply || !!installed,
      backup,
      backupVerified: !!backup,
      businessDataUnchanged: true,
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
      `20261030_cancellation_policy_${mode}.result.json`,
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
