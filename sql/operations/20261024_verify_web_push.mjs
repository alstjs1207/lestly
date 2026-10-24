// Production SQL verification in a temporary tenant. All writes are rolled back;
// message templates are disabled before any booking, and no push HTTP is sent.
import dotenv from "dotenv";
import { sql as drizzleSql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

import { loadMockedModule } from "../../tests/helpers/mocked-module.ts";

assert.equal(process.argv[2], "--live", "Explicit --live flag required");
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
const tenant = randomUUID();
const rollback = new Error("rollback_web_push_verification");
let verification;
try {
  try {
    await sql.begin(async (q) => {
      await q`SET LOCAL lock_timeout='5s'`;
      await q`SET LOCAL statement_timeout='20s'`;
      const [student] = await q`SELECT p.profile_id,p.auth_user_id,
        candidate.start_time FROM public.profiles p
        CROSS JOIN LATERAL (
          SELECT start_time FROM generate_series(
            (((now() AT TIME ZONE 'Asia/Seoul')::date+1)+time '09:00') AT TIME ZONE 'Asia/Seoul',
            (((now() AT TIME ZONE 'Asia/Seoul')::date+7)+time '20:00') AT TIME ZONE 'Asia/Seoul', interval '30 minutes') slots(start_time)
          WHERE (start_time AT TIME ZONE 'Asia/Seoul')::time BETWEEN time '09:00' AND time '20:00'
            AND (p.class_start_date IS NULL OR (start_time AT TIME ZONE 'Asia/Seoul')::date >= p.class_start_date)
            AND (p.class_end_date IS NULL OR (start_time AT TIME ZONE 'Asia/Seoul')::date <= p.class_end_date)
            AND start_time < (date_trunc('month',now() AT TIME ZONE 'Asia/Seoul')+
              CASE WHEN extract(day FROM now() AT TIME ZONE 'Asia/Seoul')>=25 THEN interval '2 months' ELSE interval '1 month' END) AT TIME ZONE 'Asia/Seoul'
            AND NOT EXISTS(SELECT 1 FROM schedules s WHERE s.student_id=p.profile_id AND s.start_time<slots.start_time+interval '3 hours' AND s.end_time>slots.start_time)
          ORDER BY start_time LIMIT 1
        ) candidate
        WHERE p.auth_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM organization_members m WHERE m.profile_id=p.profile_id AND m.role='STUDENT' AND m.state='NORMAL')
        ORDER BY p.profile_id LIMIT 1`;
      assert.ok(
        student,
        "A linked student with an eligible future slot is required",
      );
      const [teacher] =
        await q`SELECT p.profile_id FROM profiles p JOIN organization_members m USING(profile_id)
        WHERE p.auth_user_id IS NOT NULL AND m.role='ADMIN' AND m.state='NORMAL' AND p.profile_id<>${student.profile_id} LIMIT 1`;
      assert.ok(teacher, "A linked administrator is required");
      await q`INSERT INTO organizations(organization_id,name) VALUES(${tenant},'Web Push rollout verification - temporary')`;
      await q`INSERT INTO organization_members(organization_id,profile_id,role,state)
        VALUES(${tenant},${student.profile_id},'STUDENT','NORMAL'),(${tenant},${teacher.profile_id},'ADMIN','NORMAL')`;
      await q`INSERT INTO organization_templates(organization_id,super_template_id,status,send_timing,alimtalk_enabled,email_enabled)
        SELECT ${tenant},super_template_id,'INACTIVE','IMMEDIATE',false,false FROM super_templates
        ON CONFLICT(organization_id,super_template_id) DO UPDATE SET status='INACTIVE',alimtalk_enabled=false,email_enabled=false`;
      const [instructor] =
        await q`INSERT INTO instructors(organization_id,name,push_profile_id) VALUES(${tenant},'Verification instructor',${teacher.profile_id}) RETURNING instructor_id`;
      const [program] =
        await q`INSERT INTO programs(organization_id,instructor_id,title,status) VALUES(${tenant},${instructor.instructor_id},'Verification class','ACTIVE') RETURNING program_id`;
      for (let index = 0; index < 2; index++)
        await q`INSERT INTO push_subscriptions(organization_id,profile_id,device_id,endpoint,p256dh,auth)
        VALUES(${tenant},${teacher.profile_id},${randomUUID()},${`https://fcm.googleapis.com/fcm/send/never-send-verification-${randomUUID()}`},${"B".repeat(87)},${"A".repeat(22)})`;
      await q`SET LOCAL ROLE authenticated`;
      await q`SELECT set_config('request.jwt.claim.sub',${student.auth_user_id},true)`;
      await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: student.auth_user_id, role: "authenticated" })},true)`;
      const [{ id }] =
        await q`SELECT book_student_schedule(${tenant},${program.program_id},${student.start_time},${student.start_time}::timestamptz+interval '3 hours') id`;
      await q`RESET ROLE`;
      const booked =
        await q`SELECT event_type,recipient_profile_id FROM push_events WHERE organization_id=${tenant}`;
      assert.equal(booked.length, 1);
      assert.equal(booked[0].event_type, "BOOKED");
      assert.equal(booked[0].recipient_profile_id, teacher.profile_id);
      await q`SET LOCAL ROLE authenticated`;
      await q`DELETE FROM schedules WHERE schedule_id=${id}`;
      await q`RESET ROLE`;
      const events =
        await q`SELECT event_type,recipient_profile_id,body FROM push_events WHERE organization_id=${tenant} ORDER BY event_type`;
      assert.equal(events.length, 2);
      assert.ok(
        events.some(
          (event) =>
            event.event_type === "CANCELLED" &&
            event.body.includes("Verification class"),
        ),
      );
      assert.equal(
        (
          await q`SELECT count(*)::int n FROM push_deliveries d JOIN push_events e USING(event_id) WHERE e.organization_id=${tenant}`
        )[0].n,
        4,
      );
      assert.equal(
        (
          await q`SELECT count(*)::int n FROM notifications WHERE organization_id=${tenant}`
        )[0].n,
        0,
      );
      const dialect = new PgDialect();
      const store = loadMockedModule(
        new URL(
          "../../app/features/notifications/push/store.server.ts",
          import.meta.url,
        ),
        {
          "drizzle-orm": { sql: drizzleSql },
          "~/core/db/drizzle-client.server": {
            default: {
              execute(statement) {
                const query = dialect.sqlToQuery(statement);
                return q.unsafe(query.sql, query.params);
              },
            },
          },
        },
      );
      const claimed = await store.claimPushDeliveries({
        scheduleId: Number(id),
        actorProfileId: student.profile_id,
      });
      assert.equal(claimed.length, 4);
      assert.equal(
        (
          await store.claimPushDeliveries({
            scheduleId: Number(id),
            actorProfileId: student.profile_id,
          })
        ).length,
        0,
      );
      assert.equal(
        (
          await store.getPushDeliveryTarget(
            claimed[0].delivery_id,
            claimed[0].claim_token,
          )
        ).eligible,
        true,
      );
      await q`UPDATE instructors SET push_profile_id=NULL WHERE instructor_id=${instructor.instructor_id}`;
      assert.ok(
        !(
          await store.getPushDeliveryTarget(
            claimed[0].delivery_id,
            claimed[0].claim_token,
          )
        ).eligible,
      );
      verification = {
        bookingEvent: true,
        cancellationSnapshot: true,
        onlyAssignedTeacher: true,
        twoDevices: true,
        claimedOnce: true,
        reassignedTeacherBlocked: true,
        legacyNotificationsCreated: 0,
        externalMessagesSent: 0,
      };
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(
    (
      await sql`SELECT count(*)::int n FROM organizations WHERE organization_id=${tenant}`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int n FROM push_events WHERE organization_id=${tenant}`
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int n FROM push_subscriptions WHERE organization_id=${tenant}`
    )[0].n,
    0,
  );
  const result = {
    at: new Date().toISOString(),
    project: "smbpzlzbvplhtpqggrjf",
    verification,
    allVerificationWritesRolledBack: true,
    temporaryTenantRemaining: false,
  };
  await fs.writeFile(
    new URL("20261024_web_push_live_verification.result.json", import.meta.url),
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
