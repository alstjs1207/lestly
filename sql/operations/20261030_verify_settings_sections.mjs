import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

import { checkSettingsSections } from "../checks/settings-sections.mjs";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const db = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 4,
    connect_timeout: 10,
    onnotice() {},
  }),
  checks = [],
  rollback = new Error("settings_sections_probe_rollback");
const authIds = [randomUUID(), randomUUID()],
  fixtureOrg = randomUUID(),
  fixtureAuth = randomUUID();
let fixtureProfile;
async function fingerprints() {
  return db.begin(async (q) => {
    await q`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    const tables = {};
    for (const {
      tablename: n,
    } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
      assert.match(n, /^[a-z_]+$/);
      tables[n] = createHash("sha256")
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
    return tables;
  });
}
async function cleanup() {
  await db.begin(async (q) => {
    const profiles =
      await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${fixtureAuth}`;
    await q`DELETE FROM public.organizations WHERE organization_id=${fixtureOrg}`;
    await q`DELETE FROM auth.users WHERE id=${fixtureAuth}`;
    for (const { profile_id } of profiles)
      await q`DELETE FROM public.profiles WHERE profile_id=${profile_id}`;
  });
}
try {
  const before = await fingerprints();
  await assert.rejects(
    db.begin(async (base) => {
      await base`SET LOCAL statement_timeout='20s'`;
      await base`SET LOCAL lock_timeout='10s'`;
      const orgA = randomUUID(),
        orgB = randomUUID(),
        ids = [];
      for (const id of authIds) {
        await base`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${id},'{}'::jsonb)`;
        ids.push(
          (
            await base`SELECT profile_id FROM public.profiles WHERE auth_user_id=${id}`
          )[0].profile_id,
        );
      }
      const [adminA, studentA] = ids;
      await base`INSERT INTO public.organizations(organization_id,name) VALUES(${orgA},'Settings rollback A'),(${orgB},'Settings rollback B')`;
      await base`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${orgA},${adminA},'ADMIN',NULL),(${orgA},${studentA},'STUDENT','STUDENT')`;
      const existingProgramId = (
        await base`INSERT INTO public.programs(organization_id,title,status) VALUES(${orgA},'Settings unchanged class','ACTIVE') RETURNING program_id`
      )[0].program_id;
      let active = base;
      const authByProfile = new Map(ids.map((id, i) => [id, authIds[i]]));
      const params = (values, q = active) =>
        values.map((v) =>
          typeof v === "string" && /^[\[{]/.test(v) ? q.json(JSON.parse(v)) : v,
        );
      const adapter = {
        query: async (statement, values = []) => ({
          rows: Array.from(await active.unsafe(statement, params(values))),
        }),
        exec: (statement) => active.unsafe(statement),
      };
      const asRole = async (role, profile) => {
        assert.match(role, /^(postgres|authenticated|anon)$/);
        await active.unsafe(`SET LOCAL ROLE ${role}`);
        const sub = authByProfile.get(profile) ?? "";
        await active`SELECT set_config('request.jwt.claim.sub',${sub},true)`;
        await active`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub, role })},true)`;
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
          (e) => {
            if (e !== rollback) throw e;
            return true;
          },
        );
        active = base;
        checks.push(name);
      };
      await checkSettingsSections({
        db: adapter,
        check,
        asRole,
        blocked,
        orgA,
        orgB,
        adminA,
        studentA,
        existingProgramId,
      });
      throw rollback;
    }),
    (e) => {
      if (e !== rollback) throw e;
      return true;
    },
  );
  await db.begin(async (q) => {
    await q`INSERT INTO public.organizations(organization_id,name) VALUES(${fixtureOrg},'Settings concurrent fixture')`;
    await q`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${fixtureAuth},'{}'::jsonb)`;
    fixtureProfile = (
      await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${fixtureAuth}`
    )[0].profile_id;
    await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${fixtureOrg},${fixtureProfile},'ADMIN',NULL)`;
  });
  const defaults = {
      durationMinutes: [40, 80],
      defaultDurationMinutes: 40,
      maxCapacity: 7,
    },
    times = {
      firstStart: "10:00",
      lastStart: "19:00",
      startIntervalMinutes: 30,
      leadMinutes: 10,
      disabledStartTimes: ["10:30"],
    };
  const role = async (q) => {
    await q`SET LOCAL ROLE authenticated`;
    await q`SELECT set_config('request.jwt.claim.sub',${fixtureAuth},true)`;
    await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: fixtureAuth, role: "authenticated" })},true)`;
  };
  for (const [first, second] of [
    ["class_defaults", "booking_times"],
    ["booking_times", "class_defaults"],
  ]) {
    await db`DELETE FROM public.settings WHERE organization_id=${fixtureOrg}`;
    let release, ready;
    const gate = new Promise((r) => (release = r)),
      locked = new Promise((r) => (ready = r));
    const values = (section) =>
      section === "class_defaults" ? defaults : times;
    const writer = db.begin(async (q) => {
      await q`SET LOCAL statement_timeout='15s'`;
      await role(q);
      await q`SELECT public.save_booking_settings_section(${fixtureOrg},${first},${q.json(values(first))})`;
      ready();
      await gate;
    });
    try {
      await Promise.race([
        locked,
        writer.then(() => {
          throw new Error("Writer exited early");
        }),
      ]);
      await db.begin(async (q) => {
        await q`SET LOCAL statement_timeout='15s'`;
        await role(q);
        const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
        const pending =
          q`SELECT public.save_booking_settings_section(${fixtureOrg},${second},${q.json(values(second))})`.then(
            () => null,
            (e) => e,
          );
        let waiting = false;
        for (let i = 0; i < 40; i++) {
          if (
            (
              await db`SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=${pid}`
            )[0]?.waiting
          ) {
            waiting = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        assert.equal(
          waiting,
          true,
          "Second section save did not wait on the shared lock",
        );
        release();
        await writer;
        const error = await pending;
        if (error) throw error;
      });
    } finally {
      release();
      await writer;
    }
    const [row] =
      await db`SELECT setting_value FROM public.settings WHERE organization_id=${fixtureOrg} AND setting_key='booking_policy'`;
    assert.deepEqual(row.setting_value, {
      durationMinutes: [40, 80],
      defaultDurationMinutes: 40,
      firstStart: "10:00",
      lastStart: "19:00",
      startIntervalMinutes: 30,
      leadMinutes: 10,
    });
    checks.push(
      `concurrent ${first} then ${second} preserves both saved sections after lock wait`,
    );
  }
  await cleanup();
  assert.deepEqual(
    await fingerprints(),
    before,
    "Business data changed after fixture cleanup",
  );
  const result = {
    at: new Date().toISOString(),
    project: "smbpzlzbvplhtpqggrjf",
    checks,
    passed: checks.length,
    allFixturesRemoved: true,
    allBusinessDataUnchanged: true,
  };
  await fs.writeFile(
    new URL("20261030_settings_sections_live.result.json", import.meta.url),
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
  await cleanup();
  await db.end({ timeout: 5 });
}
