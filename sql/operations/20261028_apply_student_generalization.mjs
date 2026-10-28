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
const migrations = await Promise.all(
  [28, 29, 30].map(async (idx) => {
    const entry = journal.entries.find((item) => item.idx === idx);
    const source = await fs.readFile(new URL(`${entry.tag}.sql`, root), "utf8");
    return {
      ...entry,
      source,
      hash: createHash("sha256").update(source).digest("hex"),
    };
  }),
);
const body = (source, name) =>
  source
    .slice(source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`))
    .split("AS $$")[1]
    .split("$$;")[0];
const snapshot = async (q, tables) => {
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    result[table] = (
      await q.unsafe(
        `SELECT to_jsonb(t) AS row FROM public."${table}" t ORDER BY to_jsonb(t)::text`,
      )
    ).map((r) => r.row);
  }
  return result;
};
const canonical = (rows) =>
  rows
    .map((r) =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .sort();
const omitUpdated = (rows) => rows.map(({ updated_at, ...row }) => row);
const marker = "[이전 유형: 재수생]";
try {
  const result = await db.begin(async (q) => {
    if (!apply) await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL lock_timeout='10s'`;
    await q`SET LOCAL statement_timeout='60s'`;
    if (apply) await q`SELECT pg_advisory_xact_lock(20261028,2930)`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    assert.equal(
      ledger.find((r) => Number(r.created_at) === migrations[0].when)?.hash,
      migrations[0].hash,
      "0028 prerequisite mismatch",
    );
    assert.ok(
      ledger.every((r) => Number(r.created_at) <= migrations[2].when),
      "Unknown newer migration",
    );
    const installed = migrations.slice(1).map((m) => {
      const row = ledger.find((r) => Number(r.created_at) === m.when);
      if (row) assert.equal(row.hash, m.hash, "Installed hash mismatch");
      return !!row;
    });
    assert.equal(
      installed[0],
      installed[1],
      "Partial install: inspect before proceeding",
    );
    const alreadyApplied = installed[0];
    const tables = (
      await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    ).map((r) => r.tablename);
    if (apply && !alreadyApplied) {
      // Briefly prevent writes so backup and preservation comparisons share one state.
      await q.unsafe(
        `LOCK TABLE ${tables.map((t) => `public."${t}"`).join(",")} IN SHARE ROW EXCLUSIVE MODE`,
      );
    }
    const before = await snapshot(q, tables);
    const definitions =
      await q`SELECT p.proname,pg_get_function_identity_arguments(p.oid) arguments,
      pg_get_functiondef(p.oid) definition,p.prosrc,p.proacl,p.prosecdef,p.proconfig
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.proname,p.oid`;
    const save = definitions.find((f) => f.proname === "save_managed_student");
    const baseline = alreadyApplied
      ? migrations[2].source
      : await fs.readFile(
          new URL("0026_preserve_student_state_on_edit.sql", root),
          "utf8",
        );
    assert.equal(
      save.prosrc,
      body(baseline, "save_managed_student"),
      "Unexpected remote save function",
    );
    const backupFile = new URL(
      "../../.vercel/backups/20261028-student-generalization-before.json",
      import.meta.url,
    );
    if (apply && !alreadyApplied) {
      const schema = {
        columns:
          await q`SELECT * FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
        policies: await q`SELECT * FROM pg_policies WHERE schemaname='public'`,
        constraints:
          await q`SELECT c.conname,c.conrelid::regclass::text relation,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'`,
        triggers:
          await q`SELECT pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal`,
        enums:
          await q`SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`,
      };
      await fs.mkdir(new URL(".", backupFile), {
        recursive: true,
        mode: 0o700,
      });
      const backup =
        JSON.stringify(
          {
            at: new Date().toISOString(),
            project,
            ledger,
            definitions,
            schema,
            rows: before,
          },
          null,
          2,
        ) + "\n";
      await fs.writeFile(backupFile, backup, { mode: 0o600, flag: "wx" });
      assert.equal(await fs.readFile(backupFile, "utf8"), backup);
      for (const migration of migrations.slice(1)) {
        for (const statement of migration.source.split(
          "--> statement-breakpoint",
        ))
          if (statement.trim()) await q.unsafe(statement);
        await q`INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES(${migration.hash},${migration.when})`;
      }
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
      const after = await snapshot(q, tables);
      const retakers = new Set(
        before.organization_members
          .filter((m) => m.role === "STUDENT" && m.type === "DROPPER")
          .map((m) => m.profile_id),
      );
      const expectedProfiles = before.profiles.map((p) =>
        retakers.has(p.profile_id) && !(p.description ?? "").includes(marker)
          ? {
              ...p,
              description: [p.description || null, marker]
                .filter((s) => s !== null)
                .join("\n"),
            }
          : p,
      );
      const expectedMembers = before.organization_members.map((m) =>
        ["EXAMINEE", "DROPPER"].includes(m.type)
          ? { ...m, type: "STUDENT" }
          : m,
      );
      for (const table of tables) {
        const expected =
          table === "profiles"
            ? omitUpdated(expectedProfiles)
            : table === "organization_members"
              ? omitUpdated(expectedMembers)
              : before[table];
        const actual = ["profiles", "organization_members"].includes(table)
          ? omitUpdated(after[table])
          : after[table];
        assert.deepEqual(
          canonical(actual),
          canonical(expected),
          `Unexpected data change in ${table}`,
        );
      }
      const afterSave = (
        await q`SELECT prosrc,proacl,prosecdef,proconfig FROM pg_proc WHERE oid='public.save_managed_student(uuid,jsonb,uuid)'::regprocedure`
      )[0];
      assert.equal(
        afterSave.prosrc,
        body(migrations[2].source, "save_managed_student"),
      );
      for (const key of ["proacl", "prosecdef", "proconfig"])
        assert.deepEqual(
          afterSave[key],
          save[key],
          `Save function ${key} changed`,
        );
      await q`NOTIFY pgrst,'reload schema'`;
    }
    if (apply || alreadyApplied) {
      assert.equal(
        (
          await q`SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_members' AND column_name='type'`
        )[0].data_type,
        "text",
      );
      assert.equal(
        (
          await q`SELECT count(*)::int n FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND typname='user_type'`
        )[0].n,
        0,
      );
      for (const org of before.organizations)
        await q`SELECT public.assert_student_type_policy(${org.organization_id})`;
      const policy = (
        await q`SELECT has_table_privilege('authenticated','public.organization_student_types','INSERT') ins,
        has_table_privilege('authenticated','public.organization_student_types','UPDATE') upd,
        has_function_privilege('authenticated','public.save_student_types(uuid,jsonb,jsonb)','EXECUTE') rpc,
        has_function_privilege('anon','public.save_student_types(uuid,jsonb,jsonb)','EXECUTE') anonymous`
      )[0];
      assert.deepEqual(policy, {
        ins: false,
        upd: false,
        rpc: true,
        anonymous: false,
      });
    }
    return {
      at: new Date().toISOString(),
      project,
      readOnly: !apply,
      alreadyApplied,
      applied: apply || alreadyApplied,
      migrations: migrations.slice(1).map(({ tag, hash }) => ({ tag, hash })),
      backupVerified: apply && !alreadyApplied,
      existingDataPreserved: apply && !alreadyApplied ? true : undefined,
      counts: Object.fromEntries(
        Object.entries(before).map(([name, rows]) => [name, rows.length]),
      ),
      previousClassifications: before.organization_members.reduce(
        (r, m) => ({
          ...r,
          [m.type ?? "NULL"]: (r[m.type ?? "NULL"] ?? 0) + 1,
        }),
        {},
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
      `20261028_student_generalization_${mode}.result.json`,
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Do not print SQL parameters, source rows, or assertion diffs containing customer data.
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
