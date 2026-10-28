// Live probes use isolated fixtures. Authenticated RPC scenarios roll back;
// the small committed concurrency fixture is removed in finally.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

import { checkBookingPolicy } from "../checks/booking-policy.mjs";

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
const rollback = new Error("booking_policy_probe_rollback");
const orgA = randomUUID(),
  orgB = randomUUID(),
  fixtureOrg = randomUUID();
const authIds = [randomUUID(), randomUUID(), randomUUID()];
const students = [randomUUID(), randomUUID()];
const fixtureAuth = randomUUID();
const fixtureProfiles = [...students];
let fixtureStudent;
const defaults = {
  durationMinutes: [180, 360, 540],
  defaultDurationMinutes: 180,
  firstStart: "09:00",
  lastStart: "20:00",
  startIntervalMinutes: 30,
  leadMinutes: 0,
};
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
let fixtureCreated = false;
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
      await base`INSERT INTO public.profiles(profile_id,name) VALUES(${studentB},'Booking rollback fixture')`;
      await base`INSERT INTO public.organizations(organization_id,name) VALUES(${orgA},'Booking rollback A'),(${orgB},'Booking rollback B')`;
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
      await checkBookingPolicy({
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

  // No real user is attached to this committed fixture, so booking/account
  // lookups in other sessions are unaffected while the race is exercised.
  await db.begin(async (q) => {
    await q`INSERT INTO public.organizations(organization_id,name) VALUES(${fixtureOrg},'Phase 3 concurrency verification')`;
    for (const id of students) {
      await q`INSERT INTO public.profiles(profile_id,name) VALUES(${id},'Concurrency fixture')`;
      await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${fixtureOrg},${id},'STUDENT','STUDENT')`;
    }
    await q`INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(${fixtureOrg},'max_concurrent_students','{"value":1}')`;
    await q`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${fixtureAuth},'{}'::jsonb)`;
    fixtureStudent = (
      await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${fixtureAuth}`
    )[0].profile_id;
    fixtureProfiles.push(fixtureStudent);
    await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${fixtureOrg},${fixtureStudent},'STUDENT','STUDENT')`;
  });
  fixtureCreated = true;
  const [{ start }] =
    await db`SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+1+time '09:00') AT TIME ZONE 'Asia/Seoul' start`;
  const end = new Date(+start + 3600000);
  let release, ready;
  let unlocked = new Promise((resolve) => {
    release = resolve;
  });
  let locked = new Promise((resolve) => {
    ready = resolve;
  });
  const holder = db.begin(async (q) => {
    await q`INSERT INTO public.schedules(organization_id,student_id,start_time,end_time) VALUES(${fixtureOrg},${students[0]},${start},${end})`;
    ready();
    await unlocked;
  });
  const holderReady = Promise.race([
    locked,
    holder.then(() => {
      throw new Error("holder_exited_early");
    }),
  ]);
  await holderReady;
  const contender = db
    .begin(async (q) => {
      await q`SET LOCAL statement_timeout='15s'`;
      const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
      const pending =
        q`INSERT INTO public.schedules(organization_id,student_id,start_time,end_time) VALUES(${fixtureOrg},${students[1]},${start},${end})`.then(
          () => null,
          (error) => error,
        );
      assert.equal(
        await waitingForLock(pid),
        true,
        "Concurrent booking did not wait for the organization lock",
      );
      release();
      await holder;
      const error = await pending;
      if (!error) throw new Error("seat_probe_unexpectedly_succeeded");
      if (!/schedule_capacity_exceeded/.test(error.message))
        throw new Error(`seat_probe_error:${error.code}:${error.message}`);
      throw rollback;
    })
    .catch((error) => {
      release();
      if (error !== rollback) throw error;
    });
  await Promise.all([holder, contender]);
  assert.equal(
    (
      await db`SELECT count(*)::int n FROM public.schedules WHERE organization_id=${fixtureOrg}`
    )[0].n,
    1,
  );
  checks.push(
    "two connections serialize competing inserts and reject the last-seat overbooking",
  );

  unlocked = new Promise((resolve) => {
    release = resolve;
  });
  locked = new Promise((resolve) => {
    ready = resolve;
  });
  const changedPolicy = {
    ...defaults,
    durationMinutes: [40],
    defaultDurationMinutes: 40,
    firstStart: "10:00",
    startIntervalMinutes: 50,
  };
  const policyWriter = db.begin(async (q) => {
    await q`INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(${fixtureOrg},'booking_policy',${q.json(changedPolicy)})`;
    ready();
    await unlocked;
  });
  await Promise.race([
    locked,
    policyWriter.then(() => {
      throw new Error("policy_writer_exited_early");
    }),
  ]);
  const later = new Date(+start + 14400000),
    laterEnd = new Date(+later + 10800000);
  const booking = db
    .begin(async (q) => {
      await q`SET LOCAL statement_timeout='15s'`;
      await q`SET LOCAL ROLE authenticated`;
      await q`SELECT set_config('request.jwt.claim.sub',${fixtureAuth},true)`;
      await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: fixtureAuth, role: "authenticated" })},true)`;

      const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
      const pending =
        q`SELECT public.book_student_schedule(${fixtureOrg},NULL,${later},${laterEnd})`.then(
          () => null,
          (error) => error,
        );
      assert.equal(
        await waitingForLock(pid),
        true,
        "Booking did not serialize with policy save",
      );
      release();
      await policyWriter;
      const error = await pending;
      assert.match(error?.message ?? "", /schedule_time_not_allowed/);
      throw rollback;
    })
    .catch((error) => {
      release();
      if (error !== rollback) throw error;
    });
  await Promise.all([policyWriter, booking]);
  checks.push(
    "authenticated booking enforces the policy committed while it waits for the organization lock",
  );
  await db.begin(async (q) => {
    await q`DELETE FROM public.organizations WHERE organization_id=${fixtureOrg}`;
    await q`DELETE FROM auth.users WHERE id=${fixtureAuth}`;
    await q`DELETE FROM public.profiles WHERE profile_id=ANY(${q.array(fixtureProfiles, 2950)})`;
  });
  fixtureCreated = false;
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
    new URL("20261029_booking_policy_live.result.json", import.meta.url),
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
  if (fixtureCreated) {
    await db.begin(async (q) => {
      await q`DELETE FROM public.organizations WHERE organization_id=${fixtureOrg}`;
      await q`DELETE FROM auth.users WHERE id=${fixtureAuth}`;
      await q`DELETE FROM public.profiles WHERE profile_id=ANY(${q.array(fixtureProfiles, 2950)})`;
    });
  }
  await db.end({ timeout: 5 });
}
