// Live PostgreSQL concurrency check in a temporary organization only. No Auth
// accounts or contact details are created, and all delivery templates are off.
// Explicit invocation required: node sql/checks/security-concurrency.mjs --live
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

if (process.argv[2] !== "--live")
  throw new Error("Explicit --live flag required");
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
const options = {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice: () => {},
};
const admin = postgres(env.DATABASE_URL, options),
  first = postgres(env.DATABASE_URL, options),
  second = postgres(env.DATABASE_URL, options);
const org = randomUUID(),
  students = [randomUUID(), randomUUID()];
let release;
let releaseFirst = () => release?.();
try {
  const before =
    await admin`select (select count(*)::int from profiles) profiles,(select count(*)::int from schedules) schedules`;
  await admin.begin(async (q) => {
    await q`insert into organizations(organization_id,name) values(${org},'Security concurrency verification - temporary')`;
    await q`insert into organization_templates(organization_id,super_template_id,status,send_timing,alimtalk_enabled,email_enabled) select ${org},super_template_id,'INACTIVE','IMMEDIATE',false,false from super_templates`;
    for (const id of students) {
      await q`insert into profiles(profile_id,name) values(${id},'Security verification - no contact')`;
      await q`insert into organization_members(organization_id,profile_id,role) values(${org},${id},'STUDENT')`;
    }
    await q`insert into settings(organization_id,setting_key,setting_value) values(${org},'max_concurrent_students','{"value":1}')`;
  });
  let pid1, pid2, secondStarted;
  const started = new Promise((resolve) => (secondStarted = resolve));
  let announce;
  const inserted = new Promise((resolve) => (announce = resolve));
  const hold = new Promise((resolve) => (release = resolve));
  const winner = first.begin(async (q) => {
    pid1 = (await q`select pg_backend_pid() pid`)[0].pid;
    await q`SET LOCAL ROLE service_role`;
    await q`insert into schedules(organization_id,student_id,start_time,end_time) values(${org},${students[0]},'2098-01-01T00:00:00Z','2098-01-01T03:00:00Z')`;
    announce();
    await hold;
  });
  winner.catch(() => announce());
  await inserted;
  const loser = second
    .begin(async (q) => {
      pid2 = (await q`select pg_backend_pid() pid`)[0].pid;
      secondStarted();
      await q`SET LOCAL ROLE service_role`;
      await q`insert into schedules(organization_id,student_id,start_time,end_time) values(${org},${students[1]},'2098-01-01T00:00:00Z','2098-01-01T03:00:00Z')`;
    })
    .then(
      () => ({ accepted: true }),
      (error) => ({ accepted: false, message: error.message }),
    );
  await started;
  assert.notEqual(pid1, pid2);
  let observedLock = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const waiting =
      await admin`select wait_event, wait_event_type, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=${pid2}`;
    if (waiting[0]?.blockers?.includes(pid1)) {
      observedLock = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  releaseFirst();
  await winner;
  const result = await loser;
  console.log({ observedLock, result });
  assert.equal(
    observedLock,
    true,
    "Second booking must wait for the first transaction",
  );
  assert.deepEqual(result, {
    accepted: false,
    message: "schedule_capacity_exceeded",
  });
  assert.equal(
    (
      await admin`select count(*)::int n from schedules where organization_id=${org}`
    )[0].n,
    1,
  );
  assert.equal(
    (
      await admin`select count(*)::int n from notifications where organization_id=${org}`
    )[0].n,
    0,
  );
  await admin`delete from schedules where organization_id=${org}`;
  assert.equal(
    (
      await admin`select count(*)::int n from notifications where organization_id=${org}`
    )[0].n,
    0,
  );
  for (const id of students)
    await admin`delete from profiles where profile_id=${id}`;
  await admin`delete from organizations where organization_id=${org}`;
  const after =
    await admin`select (select count(*)::int from profiles) profiles,(select count(*)::int from schedules) schedules`;
  assert.deepEqual([...after], [...before]);
  const report = {
    at: new Date().toISOString(),
    observedAdvisoryLock: true,
    oneBookingAccepted: true,
    concurrentBookingRejected: "schedule_capacity_exceeded",
    notificationsCreated: 0,
    fixtureCleaned: true,
  };
  await fs.writeFile(
    new URL(
      "../operations/20261022_security_concurrency.result.json",
      import.meta.url,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(report);
} catch (error) {
  console.error({ code: error.code, message: error.message });
  process.exitCode = 1;
} finally {
  releaseFirst();
  await first.end({ timeout: 5 });
  await second.end({ timeout: 5 });
  await admin`delete from schedules where organization_id=${org}`;
  await admin`delete from notifications where organization_id=${org}`;
  for (const id of students)
    await admin`delete from profiles where profile_id=${id}`;
  await admin`delete from organizations where organization_id=${org}`;
  await admin.end({ timeout: 5 });
}
