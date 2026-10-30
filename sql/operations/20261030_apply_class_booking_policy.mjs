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
  journal = JSON.parse(await fs.readFile(new URL("meta/_journal.json", root)));
const migrationIndex = process.argv.includes("--attendance-fix") ? 37 : 36;
const entry = journal.entries.find((e) => e.idx === migrationIndex);
assert.equal(
  entry.tag,
  migrationIndex === 36
    ? "0036_class_booking_policy"
    : "0037_preserve_existing_class_attendance",
);
const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
const digest = (s) => createHash("sha256").update(s).digest("hex"),
  hash = digest(source);
const baseReplaced = {
  guard_schedule_write: 34,
  enforce_schedule_occupancy: 32,
  save_attendance: 32,
};
const baseCreated = [
  "guard_program_booking_policy",
  "read_program_booking_policy",
  "program_peak_occupancy",
  "get_student_program_booking_availability",
];
const replaced =
  migrationIndex === 36 ? baseReplaced : { enforce_schedule_occupancy: 36 };
const created = migrationIndex === 36 ? baseCreated : [];
const body = (s, n) => {
  const i = s.search(
    new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${n}\\(`),
  );
  assert.ok(i >= 0, n);
  return s.slice(i).split("AS $$")[1].split("$$;")[0];
};
const definitions = (q) =>
  q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.prosrc,p.proacl,p.prosecdef,p.proconfig,p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`;
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
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261030,36)`;
    const ledger =
      await q`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.ok(
      !ledger.some((r) => Number(r.created_at) > entry.when),
      "Unknown newer migration",
    );
    for (const e of journal.entries.filter(
      (e) => e.idx >= 28 && e.idx < migrationIndex,
    ))
      assert.equal(
        ledger.find((r) => Number(r.created_at) === e.when)?.hash,
        digest(await fs.readFile(new URL(`${e.tag}.sql`, root), "utf8")),
        `Prerequisite ${e.idx}`,
      );
    const installed = ledger.find((r) => Number(r.created_at) === entry.when);
    if (installed) assert.equal(installed.hash, hash);
    const funcs = await definitions(q);
    for (const [name, idx] of Object.entries(replaced)) {
      const prior = installed
        ? source
        : await fs.readFile(
            new URL(
              `${journal.entries.find((e) => e.idx === idx).tag}.sql`,
              root,
            ),
            "utf8",
          );
      assert.equal(
        funcs.find((f) => f.proname === name)?.prosrc,
        body(prior, name),
        `Unexpected existing ${name}`,
      );
    }
    if (!installed)
      for (const name of created)
        assert.ok(!funcs.some((f) => f.proname === name));
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((t) => t.tablename);
    if (apply && !installed)
      await q.unsafe(
        `LOCK TABLE ${tables.map((n) => `public."${n}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    const before = await snapshot(q, tables),
      policies =
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`;
    assert.equal(
      before.rows.schedules.filter((s) => s.program_id === null).length,
      0,
      "Reservations must be explicitly linked first",
    );
    const defaults = {};
    for (const org of before.rows.organizations)
      defaults[org.organization_id] = (
        await q`SELECT read_booking_policy(${org.organization_id}) p`
      )[0].p;
    let backup;
    if (apply && !installed) {
      backup = `20261030-class-booking-policy-before-${Date.now()}.json`;
      const file = new URL(`../../.vercel/backups/${backup}`, import.meta.url);
      await fs.mkdir(new URL(".", file), { recursive: true, mode: 0o700 });
      const payload =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            ledger,
            definitions: funcs,
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
      await fs.writeFile(file, payload, { flag: "wx", mode: 0o600 });
      assert.equal(await fs.readFile(file, "utf8"), payload);
      for (const part of source.split("--> statement-breakpoint"))
        if (part.trim()) await q.unsafe(part);
      await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${hash},${entry.when})`;
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
    }
    const after = await snapshot(q, tables);
    for (const name of tables)
      if (name !== "programs" || installed || !apply || migrationIndex === 37)
        assert.deepEqual(
          after.fingerprints[name],
          before.fingerprints[name],
          `Business data changed: ${name}`,
        );
    if (apply && !installed && migrationIndex === 36)
      for (const p of before.rows.programs) {
        const actual = after.rows.programs.find(
            (row) => row.program_id === p.program_id,
          ),
          d = defaults[p.organization_id],
          cap =
            before.rows.settings.find(
              (s) =>
                s.organization_id === p.organization_id &&
                s.setting_key === "max_concurrent_students",
            )?.setting_value.value ?? 5;
        assert.deepEqual(actual, {
          ...p,
          duration_minutes: p.duration_minutes ?? d.defaultDurationMinutes,
          max_capacity: p.max_capacity ?? cap,
          booking_duration_minutes: [
            ...new Set([
              ...d.durationMinutes,
              p.duration_minutes ?? d.defaultDurationMinutes,
            ]),
          ].sort((a, b) => a - b),
          updated_at: actual.updated_at,
        });
      }
    if (apply || installed) {
      const afterFuncs = await definitions(q);
      for (const name of [...Object.keys(replaced), ...created])
        assert.equal(
          afterFuncs.find((f) => f.proname === name)?.prosrc,
          body(source, name),
          name,
        );
      for (const f of funcs)
        if (!Object.hasOwn(replaced, f.proname))
          assert.deepEqual(
            afterFuncs.find(
              (g) => g.proname === f.proname && g.arguments === f.arguments,
            ),
            f,
            `Unrelated function ${f.proname}`,
          );
      assert.deepEqual(
        await q`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`,
        policies,
      );
      assert.deepEqual(
        (
          await q`SELECT has_function_privilege('anon','public.get_student_program_booking_availability(uuid,bigint,date,integer)','EXECUTE') anonymous,has_function_privilege('authenticated','public.get_student_program_booking_availability(uuid,bigint,date,integer)','EXECUTE') authenticated`
        )[0],
        { anonymous: false, authenticated: true },
      );
      assert.equal(
        (
          await q`SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='schedules' AND column_name='program_id'`
        )[0].is_nullable,
        "NO",
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
      allReservationsUnchanged: true,
      allNonProgramDataUnchanged: true,
      programsChangedOnlyAsSpecified: true,
      unlinkedReservations: 0,
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
      `20261030_class_booking_policy${migrationIndex === 37 ? "_attendance_fix" : ""}_${mode}.result.json`,
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
