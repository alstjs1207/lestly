// Live probes use isolated fixtures. Authenticated RPC scenarios roll back;
// the small committed concurrency fixture is removed in finally.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

import { checkBookingWindow } from "../checks/booking-window.mjs";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const db = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 3,
  connect_timeout: 10,
  onnotice() {},
});
const checks = [];
const rollback = new Error("booking_window_probe_rollback");
const orgA = randomUUID(),
  orgB = randomUUID(),
  fixtureOrg = randomUUID();
const authIds = [randomUUID(), randomUUID(), randomUUID()];
const fixtureAuth = randomUUID();
const fixtureProfiles = [];
let fixtureStudent;
const fingerprints = async () =>
  db.begin(async (q) => {
    await q`SET TRANSACTION READ ONLY`;
    const result = {};
    for (const {
      tablename,
    } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
      assert.match(tablename, /^[a-z_]+$/);
      const rows = (
        await q.unsafe(
          `SELECT to_jsonb(t) row FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`,
        )
      ).map((r) => r.row);
      result[tablename] = {
        count: rows.length,
        hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      };
    }
    return result;
  });
const waitingForLock = async (pid) => {
  for (let i = 0; i < 40; i++) {
    if (
      (
        await db`SELECT wait_event_type='Lock' waiting FROM pg_stat_activity WHERE pid=${pid}`
      )[0]?.waiting
    )
      return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};
try {
  const before = await fingerprints();
  await assert.rejects(
    db.begin(async (base) => {
      await base`SET LOCAL statement_timeout='20s'`;
      await base`SET LOCAL lock_timeout='10s'`;
      // Direct SQL Auth fixtures have no email and are never committed or signed in.
      const ids = [];
      for (const id of authIds) {
        await base`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${id},'{}'::jsonb)`;
        const profile = (
          await base`SELECT profile_id FROM public.profiles WHERE auth_user_id=${id}`
        )[0];
        assert.ok(
          profile,
          "Auth profile trigger did not create a fixture profile",
        );
        ids.push(profile.profile_id);
      }
      const [adminA, adminB, studentA] = ids;
      const studentB = randomUUID();
      await base`INSERT INTO public.profiles(profile_id,name) VALUES(${studentB},'Window rollback fixture')`;
      await base`INSERT INTO public.organizations(organization_id,name) VALUES(${orgA},'Window rollback A'),(${orgB},'Window rollback B')`;
      await base`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES
      (${orgA},${adminA},'ADMIN',NULL),(${orgB},${adminB},'ADMIN',NULL),(${orgA},${studentA},'STUDENT','STUDENT'),(${orgB},${studentB},'STUDENT','STUDENT')`;
      const authByProfile = new Map(ids.map((id, i) => [id, authIds[i]]));
      let active = base;
      const parameters = (values, sql = active) =>
        values.map((value) =>
          typeof value === "string" && /^[\[{]/.test(value)
            ? sql.json(JSON.parse(value))
            : Array.isArray(value)
              ? sql.array(value, 20)
              : value,
        );
      const adapter = {
        query: async (statement, params = []) => ({
          rows: Array.from(await active.unsafe(statement, parameters(params))),
        }),
        exec: (statement) => active.unsafe(statement),
      };
      const asRole = async (name, profile) => {
        assert.match(name, /^(postgres|authenticated|anon)$/);
        await active.unsafe(`SET LOCAL ROLE ${name}`);
        const sub = authByProfile.get(profile) ?? "";
        await active`SELECT set_config('request.jwt.claim.sub',${sub},true)`;
        await active`SELECT set_config('request.jwt.claims',${JSON.stringify(sub ? { sub, role: name } : { role: name })},true)`;
      };
      const blocked = async (statement, params, expected) =>
        assert.rejects(
          active.savepoint((s) => s.unsafe(statement, parameters(params, s))),
          expected,
        );
      const check = async (name, run) => {
        await assert.rejects(
          base.savepoint(async (s) => {
            active = s;
            try {
              await run();
            } catch (error) {
              const cause =
                error.actual instanceof Error ? error.actual : error;
              throw new Error(
                `${name}: ${cause.code ?? ""} ${String(cause.message).split("\n")[0]}`,
              );
            }
            throw rollback;
          }),
          (error) => {
            if (error !== rollback) throw error;
            return true;
          },
        );
        active = base;
        checks.push(name);
      };
      await checkBookingWindow({
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
      });
      throw rollback;
    }),
    (error) => {
      if (error !== rollback) throw error;
      return true;
    },
  );
  assert.equal(
    (
      await db`SELECT count(*)::int n FROM auth.users WHERE id=ANY(${db.array(authIds, 2950)})`
    )[0].n,
    0,
  );

  // A private, email-free fixture is temporarily visible to two SQL connections.
  // No booking is committed; all fixture rows are removed in finally.
  await db.begin(async (q) => {
    await q`INSERT INTO public.organizations(organization_id,name) VALUES(${fixtureOrg},'Phase 4 concurrency verification')`;
    await q`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${fixtureAuth},'{}'::jsonb)`;
    fixtureStudent = (
      await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${fixtureAuth}`
    )[0].profile_id;
    fixtureProfiles.push(fixtureStudent);
    await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${fixtureOrg},${fixtureStudent},'STUDENT','STUDENT')`;
    await q`INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(${fixtureOrg},'booking_window','{"mode":"rolling","daysAhead":14}')`;
  });
  const [{ start }] =
    await db`SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+2+time '09:00') AT TIME ZONE 'Asia/Seoul' start`;
  const end = new Date(+start + 3 * 3600000);
  let release, ready;
  const unlocked = new Promise((resolve) => {
    release = resolve;
  });
  const locked = new Promise((resolve) => {
    ready = resolve;
  });
  const writer = db.begin(async (q) => {
    await q`SET LOCAL statement_timeout='15s'`;
    await q`UPDATE public.settings SET setting_value='{"mode":"rolling","daysAhead":0}' WHERE organization_id=${fixtureOrg} AND setting_key='booking_window'`;
    ready();
    await unlocked;
  });
  try {
    await Promise.race([
      locked,
      writer.then(() => {
        throw new Error("window_writer_exited_early");
      }),
    ]);
    await assert.rejects(
      db.begin(async (q) => {
        await q`SET LOCAL statement_timeout='15s'`;
        await q`SET LOCAL ROLE authenticated`;
        await q`SELECT set_config('request.jwt.claim.sub',${fixtureAuth},true)`;
        await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: fixtureAuth, role: "authenticated" })},true)`;
        const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
        const pending =
          q`SELECT public.book_student_schedule(${fixtureOrg},NULL,${start},${end})`.then(
            () => null,
            (error) => error,
          );
        assert.equal(
          await waitingForLock(pid),
          true,
          "Booking did not wait for the window settings lock",
        );
        release();
        await writer;
        const error = await pending;
        assert.match(error?.message ?? "", /schedule_date_not_allowed/);
        throw rollback;
      }),
      (error) => {
        if (error !== rollback) throw error;
        return true;
      },
    );
  } finally {
    release();
    await writer;
  }
  checks.push(
    "authenticated booking waits for settings save and enforces the newly committed shorter window",
  );
  await db.begin(async (q) => {
    await q`DELETE FROM public.organizations WHERE organization_id=${fixtureOrg}`;
    await q`DELETE FROM auth.users WHERE id=${fixtureAuth}`;
    await q`DELETE FROM public.profiles WHERE profile_id=ANY(${q.array(fixtureProfiles, 2950)})`;
  });
  assert.equal(
    (
      await db`SELECT count(*)::int n FROM auth.users WHERE id=${fixtureAuth}`
    )[0].n,
    0,
  );
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
    businessDataUnchanged: true,
  };
  await fs.writeFile(
    new URL("20261029_booking_window_live.result.json", import.meta.url),
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
  // Own random fixture identities only; safely repeat even after partial setup.
  await db.begin(async (q) => {
    const profiles =
      await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${fixtureAuth}`;
    await q`DELETE FROM public.organizations WHERE organization_id=${fixtureOrg}`;
    await q`DELETE FROM auth.users WHERE id=${fixtureAuth}`;
    const ids = [
      ...new Set([...fixtureProfiles, ...profiles.map((r) => r.profile_id)]),
    ];
    if (ids.length)
      await q`DELETE FROM public.profiles WHERE profile_id=ANY(${q.array(ids, 2950)})`;
  });
  await db.end({ timeout: 5 });
}
