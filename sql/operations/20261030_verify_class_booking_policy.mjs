import dotenv from "dotenv";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

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
  org = randomUUID(),
  auths = [randomUUID(), randomUUID()],
  profiles = [randomUUID(), randomUUID(), randomUUID()],
  checks = [],
  rollback = new Error("class_policy_fixture_rollback");
let before;
async function fingerprints() {
  const r = {};
  await db.begin(async (q) => {
    await q`SET TRANSACTION READ ONLY`;
    for (const {
      tablename: n,
    } of await q`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`) {
      assert.match(n, /^[a-z_]+$/);
      r[n] = createHash("sha256")
        .update(
          JSON.stringify(
            await q.unsafe(
              `SELECT to_jsonb(t) row FROM public."${n}" t ORDER BY to_jsonb(t)::text`,
            ),
          ),
        )
        .digest("hex");
    }
  });
  return r;
}
async function cleanup() {
  await db.begin(async (q) => {
    await q`DELETE FROM public.schedules WHERE organization_id=${org}`;
    await q`DELETE FROM public.organizations WHERE organization_id=${org}`;
    await q`DELETE FROM auth.users WHERE id=ANY(${q.array(auths, 2950)})`;
    await q`DELETE FROM public.profiles WHERE profile_id=ANY(${q.array(profiles, 2950)})`;
  });
}
try {
  before = await fingerprints();
  // Authenticated policy and cancellation probes are never committed.
  await assert.rejects(
    db.begin(async (q) => {
      const localOrg = randomUUID(),
        otherOrg = randomUUID();
      await q`INSERT INTO public.organizations(organization_id,name) VALUES(${localOrg},'Class policy rollback'),(${otherOrg},'Class policy foreign rollback')`;
      const ids = [];
      for (const id of auths) {
        await q`INSERT INTO auth.users(id,raw_user_meta_data) VALUES(${id},'{}'::jsonb)`;
        ids.push(
          (
            await q`SELECT profile_id FROM public.profiles WHERE auth_user_id=${id}`
          )[0].profile_id,
        );
      }
      await q`INSERT INTO public.profiles(profile_id,name) VALUES(${profiles[0]},'Class policy rollback student')`;
      await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${localOrg},${ids[0]},'ADMIN',NULL),(${localOrg},${ids[1]},'STUDENT','STUDENT'),(${localOrg},${profiles[0]},'STUDENT','STUDENT')`;
      await q`UPDATE public.organization_templates SET status='INACTIVE' WHERE organization_id=${localOrg}`;
      await q`INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(${localOrg},'booking_window','{"mode":"rolling","daysAhead":14}'),(${localOrg},'max_concurrent_students','{"value":1}')`;
      const make = async (organization = localOrg) =>
        (
          await q`INSERT INTO public.programs(organization_id,title,status,duration_minutes,booking_duration_minutes,max_capacity) VALUES(${organization},'Class policy rollback','ACTIVE',50,ARRAY[50,90],1) RETURNING program_id`
        )[0].program_id;
      const a = await make(),
        b = await make(),
        foreign = await make(otherOrg);
      const [{ start, booking_date }] =
        await q`SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+2+time '09:00') AT TIME ZONE 'Asia/Seoul' start,((now() AT TIME ZONE 'Asia/Seoul')::date+2)::text booking_date`;
      const end = new Date(+start + 50 * 60000);
      const seed = (program, student, startAt = start, endAt = end) =>
        q`INSERT INTO public.schedules(organization_id,program_id,student_id,start_time,end_time) VALUES(${localOrg},${program},${student},${startAt},${endAt}) RETURNING *`;
      const blocked = (fn, re) => assert.rejects(q.savepoint(fn), re);
      await seed(a, profiles[0]);
      await blocked(
        (s) =>
          s`INSERT INTO public.schedules(organization_id,program_id,student_id,start_time,end_time) VALUES(${localOrg},${a},${ids[1]},${start},${end})`,
        /schedule_capacity_exceeded/,
      );
      const second = (await seed(b, ids[1]))[0];
      assert.equal(
        (
          await q`SELECT program_peak_occupancy(${localOrg},${b},${start},${end}) n`
        )[0].n,
        1,
      );
      await q`DELETE FROM public.schedules WHERE schedule_id=${second.schedule_id}`;
      checks.push(
        "same-class capacity blocks excess; different class has an independent seat",
      );
      await q`SET LOCAL ROLE authenticated`;
      await q`SELECT set_config('request.jwt.claim.sub',${auths[1]},true)`;
      const slots = async (p) =>
        await q`SELECT * FROM public.get_student_program_booking_availability(${localOrg},${p},${booking_date},50)`;
      assert.equal((await slots(a))[0].reason, "capacity");
      assert.equal((await slots(b))[0].available, true);
      await blocked(
        (s) =>
          s`SELECT * FROM public.get_student_program_booking_availability(${localOrg},${foreign},${booking_date},50)`,
        /schedule_program_not_eligible/,
      );
      await blocked(
        (s) =>
          s`SELECT * FROM public.get_student_program_booking_availability(${localOrg},${b},${booking_date},180)`,
        /schedule_date_not_allowed/,
      );
      checks.push(
        "authenticated availability uses selected class duration/capacity and rejects foreign classes",
      );
      const booked = (
        await q`SELECT public.book_student_schedule_with_policy(${localOrg},${b},${start},${end},'{"mode":"previous_day"}'::jsonb,false) id`
      )[0].id;
      await blocked(
        (s) =>
          s`SELECT public.book_student_schedule_with_policy(${localOrg},NULL,${start},${end},'{"mode":"previous_day"}'::jsonb,false)`,
        /schedule_program_required/,
      );
      await blocked(
        (s) =>
          s`SELECT public.book_student_schedule_with_policy(${localOrg},${b},${start},${end},'{"mode":"hours_before","hours":3}'::jsonb,false)`,
        /schedule_cancellation_policy_changed/,
      );
      checks.push(
        "student booking requires class and exact cancellation acknowledgement",
      );
      await q`RESET ROLE`;
      await q`SELECT set_config('request.jwt.claim.sub','',true)`;
      const saved = (
        await q`SELECT * FROM public.schedules WHERE schedule_id=${booked}`
      )[0];
      await q`UPDATE public.programs SET duration_minutes=90,booking_duration_minutes=ARRAY[90],max_capacity=2 WHERE program_id=${b}`;
      assert.deepEqual(
        (
          await q`SELECT * FROM public.schedules WHERE schedule_id=${booked}`
        )[0],
        saved,
      );
      await q`UPDATE public.settings SET setting_value='{"value":9}' WHERE organization_id=${localOrg} AND setting_key='max_concurrent_students'`;
      assert.equal(
        (
          await q`SELECT max_capacity FROM public.programs WHERE program_id=${b}`
        )[0].max_capacity,
        2,
      );
      checks.push(
        "class/org changes preserve reservation times and cancellation snapshots without propagation",
      );
      await blocked(
        (s) => s`DELETE FROM public.programs WHERE program_id=${b}`,
        /foreign key constraint/,
      );
      checks.push("reserved classes cannot be deleted");
      const attendanceClass = await make();
      await q`UPDATE public.programs SET max_capacity=2 WHERE program_id=${attendanceClass}`;
      const past = new Date(Date.now() - 5 * 86400000),
        pastEnd = new Date(+past + 50 * 60000);
      const attendanceA = (
          await seed(attendanceClass, ids[1], past, pastEnd)
        )[0],
        attendanceB = (
          await seed(attendanceClass, profiles[0], past, pastEnd)
        )[0];
      await q`UPDATE public.programs SET max_capacity=1 WHERE program_id=${attendanceClass}`;
      await q`SET LOCAL ROLE authenticated`;
      await q`SELECT set_config('request.jwt.claim.sub',${auths[0]},true)`;
      await q`SELECT public.save_attendance(${localOrg},${q.json([attendanceA, attendanceB].map((r) => ({ schedule_id: r.schedule_id, version: 0, status: "PRESENT" })))})`;
      assert.equal(
        (
          await q`SELECT count(*)::int n FROM public.schedules WHERE program_id=${attendanceClass} AND attendance_status='PRESENT'`
        )[0].n,
        2,
      );
      checks.push(
        "lower class capacity does not block attendance confirmation for already active reservations",
      );
      throw rollback;
    }),
    (e) => {
      if (e !== rollback) throw e;
      return true;
    },
  );
  // Dedicated managed-student fixture has no login, email or deliveries.
  let a, b;
  await db.begin(async (q) => {
    await q`INSERT INTO public.organizations(organization_id,name) VALUES(${org},'Class policy concurrency fixture')`;
    await q`UPDATE public.organization_templates SET status='INACTIVE' WHERE organization_id=${org}`;
    for (const id of profiles) {
      await q`INSERT INTO public.profiles(profile_id,name) VALUES(${id},'Class policy concurrency fixture')`;
      await q`INSERT INTO public.organization_members(organization_id,profile_id,role,type) VALUES(${org},${id},'STUDENT','STUDENT')`;
    }
    [a, b] = (
      await q`INSERT INTO public.programs(organization_id,title,status,duration_minutes,booking_duration_minutes,max_capacity) VALUES(${org},'Concurrency A','ACTIVE',50,ARRAY[50],1),(${org},'Concurrency B','ACTIVE',50,ARRAY[50],1) RETURNING program_id`
    ).map((r) => r.program_id);
  });
  const start = new Date(Date.now() + 86400000),
    end = new Date(+start + 50 * 60000);
  let release, ready;
  const gate = new Promise((r) => (release = r)),
    locked = new Promise((r) => (ready = r));
  const writer = db.begin(async (q) => {
    await q`SET LOCAL statement_timeout='15s'`;
    await q`INSERT INTO public.schedules(organization_id,program_id,student_id,start_time,end_time) VALUES(${org},${a},${profiles[0]},${start},${end})`;
    ready();
    await gate;
  });
  try {
    await Promise.race([
      locked,
      writer.then(() => {
        throw new Error("writer exited before lock");
      }),
    ]);
    const loser = db.begin(async (q) => {
      await q`SET LOCAL statement_timeout='15s'`;
      const [{ pid }] = await q`SELECT pg_backend_pid() pid`;
      const pending =
        q`INSERT INTO public.schedules(organization_id,program_id,student_id,start_time,end_time) VALUES(${org},${a},${profiles[1]},${start},${end})`.then(
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
      assert.equal(waiting, true, "second writer did not wait");
      release();
      await writer;
      const error = await pending;
      assert.match(error?.message ?? "", /schedule_capacity_exceeded/);
      throw rollback;
    });
    await assert.rejects(loser, (e) => {
      if (e !== rollback) throw e;
      return true;
    });
  } finally {
    release();
    await writer;
  }
  checks.push(
    "simultaneous bookings serialize and exactly one occupies the last same-class seat",
  );
  await db`INSERT INTO public.schedules(organization_id,program_id,student_id,start_time,end_time) VALUES(${org},${b},${profiles[1]},${start},${end})`;
  checks.push(
    "another class remains available at the same time after a competing class fills",
  );
  await cleanup();
  assert.deepEqual(
    await fingerprints(),
    before,
    "Existing business data changed after cleanup",
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
    new URL("20261030_class_booking_policy_live.result.json", import.meta.url),
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
