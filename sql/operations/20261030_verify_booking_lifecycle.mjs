import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

import { checkBookingLifecycle } from "../checks/booking-lifecycle.mjs";

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
const rollback = new Error("booking_lifecycle_verification_rollback"),
  checks = [];
async function fingerprints() {
  return db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    const r = {};
    for (const {
      tablename: n,
    } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
      assert.match(n, /^[a-z_]+$/);
      r[n] = createHash("sha256")
        .update(
          JSON.stringify(
            (
              await q.unsafe(
                `SELECT to_jsonb(t) row FROM public."${n}" t ORDER BY to_jsonb(t)::text`,
              )
            ).map((r) => r.row),
          ),
        )
        .digest("hex");
    }
    return r;
  });
}
try {
  const migration = await fs.readFile(
    new URL(
      "../migrations/0039_booking_lifecycle_integrity.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    (
      await db`SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=1793404800007`
    )[0]?.hash,
    createHash("sha256").update(migration).digest("hex"),
    "Migration 0039 must be installed",
  );
  const before = await fingerprints();
  await assert.rejects(
    db.begin(async (base) => {
      await base`SET LOCAL statement_timeout='30s'`;
      await base`SET LOCAL lock_timeout='10s'`;
      const orgA = randomUUID(),
        orgB = randomUUID(),
        auths = [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
        ids = [];
      for (const id of auths) {
        await base`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${id},'{}'::jsonb)`;
        ids.push(
          (
            await base`SELECT profile_id FROM public.profiles WHERE auth_user_id=${id}`
          )[0].profile_id,
        );
      }
      const [adminA, adminB, studentA, studentB] = ids,
        managedStudent = randomUUID();
      await base`INSERT INTO public.organizations(organization_id,name) VALUES(${orgA},'Booking rollback A'),(${orgB},'Booking rollback B')`;
      await base`INSERT INTO public.profiles(profile_id,name) VALUES(${managedStudent},'Booking rollback managed student')`;
      await base`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${orgA},${adminA},'ADMIN',NULL),(${orgB},${adminB},'ADMIN',NULL),(${orgA},${studentA},'STUDENT','STUDENT'),(${orgB},${studentB},'STUDENT','STUDENT'),(${orgA},${managedStudent},'STUDENT','STUDENT')`;
      let active = base;
      const params = (values, q = active) =>
        values.map((v) =>
          Array.isArray(v)
            ? q.array(v, 25)
            : typeof v === "string" && /^[\[{]/.test(v)
              ? q.json(JSON.parse(v))
              : v,
        );
      const adapter = {
        query: async (statement, values = []) => ({
          rows: Array.from(await active.unsafe(statement, params(values))),
        }),
        exec: (statement) => active.unsafe(statement),
      };
      const authByProfile = new Map(ids.map((id, i) => [id, auths[i]]));
      const asRole = async (role, profile = "", claims = {}) => {
        assert.match(role, /^(postgres|authenticated|anon)$/);
        await active.unsafe(`SET LOCAL ROLE ${role}`);
        const sub = authByProfile.get(profile) ?? "";
        await active`SELECT set_config('request.jwt.claim.sub',${sub},true)`;
        await active`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub, role, ...claims })},true)`;
      };
      const blocked = (statement, values, expected) =>
        assert.rejects(
          active.savepoint((q) => q.unsafe(statement, params(values, q))),
          expected,
        );
      const check = async (name, run) => {
        await assert.rejects(
          base.savepoint(async (q) => {
            active = q;
            await run();
            throw rollback;
          }),
          (e) => e === rollback,
        );
        active = base;
        checks.push(name);
        console.log("PASS live rollback", name);
      };
      await checkBookingLifecycle({
        db: adapter,
        check,
        asRole,
        blocked,
        orgA,
        orgB,
        adminA,
        adminB,
        studentA,
        studentB,
        managedStudent,
      });
      throw rollback;
    }),
    (e) => e === rollback,
  );
  const after = await fingerprints();
  assert.deepEqual(
    after,
    before,
    "Persistent business data changed during rollback verification",
  );
  const result = {
    at: new Date().toISOString(),
    project: "smbpzlzbvplhtpqggrjf",
    checks: checks.length,
    names: checks,
    allScenariosRolledBack: true,
    allBusinessDataUnchanged: true,
    realMessagesSent: false,
  };
  await fs.writeFile(
    new URL("20261030_booking_lifecycle_live.result.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      allScenariosRolledBack: true,
      allBusinessDataUnchanged: true,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({ code: e.code, message: String(e.message).slice(0, 1200) }),
  );
  process.exitCode = 1;
} finally {
  await db.end({ timeout: 5 });
}
