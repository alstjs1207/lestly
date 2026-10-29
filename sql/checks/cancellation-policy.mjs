import assert from "node:assert/strict";

import { canCancelWithPolicy } from "../../app/features/app-settings/cancellation-policy.ts";

const previous = { mode: "previous_day" };
const hours = { mode: "hours_before", hours: 24 };

export async function checkCancellationMigration(db, source) {
  await db.exec("BEGIN");
  try {
    const org = "97000000-0000-0000-0000-000000000001",
      student = "97000000-0000-0000-0000-000000000002";
    await db.query(
      "INSERT INTO organizations(organization_id,name) VALUES($1,'Cancellation upgrade')",
      [org],
    );
    await db.query(
      "INSERT INTO profiles(profile_id,name) VALUES($1,'Existing cancellation fixture')",
      [student],
    );
    await db.query(
      "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
      [org, student],
    );
    const {
      rows: [row],
    } = await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '90 days',now()+interval '90 days 3 hours') RETURNING to_jsonb(schedules) old",
      [org, student],
    );
    await db.exec("SET CONSTRAINTS ALL IMMEDIATE");
    for (const part of source.split("--> statement-breakpoint"))
      if (part.trim()) await db.exec(part);
    const saved = (
      await db.query(
        "SELECT to_jsonb(s)-'cancellation_policy' old,cancellation_policy FROM schedules s WHERE schedule_id=$1",
        [row.old.schedule_id],
      )
    ).rows[0];
    assert.deepEqual(saved.old, row.old);
    assert.deepEqual(saved.cancellation_policy, previous);
    console.log(
      "PASS cancellation migration preserves existing reservations with previous-day snapshots",
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}

export async function checkCancellationPolicy({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  studentA,
  studentB,
}) {
  const set = async (policy) =>
    db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'cancellation_policy',$2) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
      [orgA, JSON.stringify(policy)],
    );
  const setup = async (policy = previous) => {
    await asRole("postgres");
    await db.query(
      "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
      [studentA],
    );
    await db.query(
      'INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,\'booking_window\',\'{"mode":"rolling","daysAhead":14}\') ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value',
      [orgA],
    );
    await set(policy);
  };
  const create = async (delta, claimed = previous) =>
    (
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time,cancellation_policy) VALUES($1,$2,now()+$3::interval,now()+$3::interval+interval '3 hours',$4) RETURNING schedule_id,cancellation_policy,start_time",
        [orgA, studentA, delta, JSON.stringify(claimed)],
      )
    ).rows[0];
  await check(
    "JS and SQL cancellation rules agree at KST midnight, hour cutoffs, zero, leap day and year boundaries",
    async () => {
      await asRole("postgres");
      for (const start of [
        "2026-11-02T18:00:00+09:00",
        "2028-03-01T00:00:00+09:00",
        "2027-01-01T09:00:00+09:00",
      ])
        for (const policy of [
          previous,
          hours,
          { mode: "hours_before", hours: 0 },
          { mode: "hours_before", hours: 720 },
        ]) {
          const date = new Date(start);
          for (const offset of [
            -720 * 3600000 - 1,
            -24 * 3600000 - 1,
            -24 * 3600000,
            -24 * 3600000 + 1,
            -3600000,
            -1,
            0,
            1,
          ]) {
            const now = new Date(+date + offset);
            assert.equal(
              (
                await db.query(
                  "SELECT cancellation_allowed($1,$2,$3) allowed",
                  [start, JSON.stringify(policy), now.toISOString()],
                )
              ).rows[0].allowed,
              canCancelWithPolicy(date, policy, now),
            );
          }
          const midnight = new Date(start.slice(0, 10) + "T00:00:00+09:00");
          for (const offset of [-1, 0, 1]) {
            const now = new Date(+midnight + offset);
            assert.equal(
              (
                await db.query(
                  "SELECT cancellation_allowed($1,$2,$3) allowed",
                  [start, JSON.stringify(policy), now.toISOString()],
                )
              ).rows[0].allowed,
              canCancelWithPolicy(date, policy, now),
            );
          }
        }
    },
  );
  await check(
    "invalid and unauthorized cancellation settings fail, and mixed settings save atomically",
    async () => {
      await setup();
      await asRole("authenticated", adminA);
      for (const p of [
        null,
        {},
        { mode: "both" },
        { mode: "previous_day", hours: 24 },
        { mode: "hours_before" },
        { mode: "hours_before", hours: "24" },
        { mode: "hours_before", hours: -1 },
        { mode: "hours_before", hours: 721 },
        { mode: "hours_before", hours: 1.5 },
      ])
        await blocked(
          "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'cancellation_policy',$2) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
          [orgA, JSON.stringify(p)],
          /invalid_cancellation_policy/,
        );
      const snap =
        "SELECT setting_key,setting_value FROM settings WHERE organization_id=$1 ORDER BY setting_key";
      const before = (await db.query(snap, [orgA])).rows;
      await blocked(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'max_concurrent_students','{\"value\":7}'),($1,'cancellation_policy','{\"mode\":\"both\"}') ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA],
        /invalid_cancellation_policy/,
      );
      assert.deepEqual((await db.query(snap, [orgA])).rows, before);
      await asRole("authenticated", studentA);
      await blocked(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'cancellation_policy',$2)",
        [orgA, JSON.stringify(hours)],
        /row.level security|permission/,
      );
      await blocked(
        "SELECT read_cancellation_policy($1)",
        [orgB],
        /permission/,
      );
      await asRole("anon");
      await blocked(
        "SELECT cancellation_allowed(now(),$1,now())",
        [JSON.stringify(previous)],
        /permission/,
      );
    },
  );
  await check(
    "inserts ignore supplied snapshots, settings changes preserve prior reservations and edits keep their original rule",
    async () => {
      await setup(hours);
      const row = await create("5 days", previous);
      assert.deepEqual(row.cancellation_policy, hours);
      await set({ mode: "hours_before", hours: 0 });
      assert.deepEqual(
        (
          await db.query(
            "SELECT cancellation_policy FROM schedules WHERE schedule_id=$1",
            [row.schedule_id],
          )
        ).rows[0].cancellation_policy,
        hours,
      );
      await blocked(
        "UPDATE schedules SET cancellation_policy=$2 WHERE schedule_id=$1",
        [row.schedule_id, JSON.stringify(previous)],
        /schedule_cancellation_policy_immutable/,
      );
      await db.query(
        "UPDATE schedules SET start_time=start_time+interval '1 hour',end_time=end_time+interval '1 hour' WHERE schedule_id=$1",
        [row.schedule_id],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT cancellation_policy FROM schedules WHERE schedule_id=$1",
            [row.schedule_id],
          )
        ).rows[0].cancellation_policy,
        hours,
      );
      await asRole("authenticated", adminA);
      const fresh = await create("7 days", hours);
      assert.deepEqual(fresh.cancellation_policy, {
        mode: "hours_before",
        hours: 0,
      });
    },
  );
  await check(
    "student DELETE uses saved cutoff, blocks other students and expired bookings, and keeps admin exceptions",
    async () => {
      await setup({ mode: "hours_before", hours: 0 });
      const open = await create("2 hours");
      await set(hours);
      const closed = await create("6 hours");
      await asRole("authenticated", studentB);
      assert.equal(
        (
          await db.query(
            "DELETE FROM schedules WHERE schedule_id=$1 RETURNING schedule_id",
            [open.schedule_id],
          )
        ).rows.length,
        0,
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (
          await db.query(
            "DELETE FROM schedules WHERE schedule_id=$1 RETURNING schedule_id",
            [closed.schedule_id],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "DELETE FROM schedules WHERE schedule_id=$1 RETURNING schedule_id",
            [open.schedule_id],
          )
        ).rows.length,
        1,
      );
      await asRole("authenticated", adminA);
      assert.equal(
        (
          await db.query(
            "DELETE FROM schedules WHERE schedule_id=$1 RETURNING schedule_id",
            [closed.schedule_id],
          )
        ).rows.length,
        1,
      );
    },
  );
  await check(
    "booking confirmation rechecks the shown policy and expired-cutoff acknowledgement before creating a snapshot",
    async () => {
      await setup({ mode: "hours_before", hours: 720 });
      const { start } = (
        await db.query(
          "SELECT (((now() AT TIME ZONE 'Asia/Seoul')::date+2)+time '09:00') AT TIME ZONE 'Asia/Seoul' start",
        )
      ).rows[0];
      const sql =
        "SELECT book_student_schedule_with_policy($1,null,$2::timestamptz,$2::timestamptz+interval '3 hours',$3,$4) id";
      await asRole("authenticated", studentA);
      await blocked(
        sql,
        [orgA, start, JSON.stringify(previous), true],
        /schedule_cancellation_policy_changed/,
      );
      await blocked(
        sql,
        [
          orgA,
          start,
          JSON.stringify({ mode: "hours_before", hours: 720 }),
          false,
        ],
        /schedule_cancellation_ack_required/,
      );
      const row = (
        await db.query(sql, [
          orgA,
          start,
          JSON.stringify({ mode: "hours_before", hours: 720 }),
          true,
        ])
      ).rows[0];
      assert.ok(row.id);
      assert.deepEqual(
        (
          await db.query(
            "SELECT cancellation_policy FROM schedules WHERE schedule_id=$1",
            [row.id],
          )
        ).rows[0].cancellation_policy,
        { mode: "hours_before", hours: 720 },
      );
      await asRole("anon");
      await blocked(
        sql,
        [orgA, start, JSON.stringify(previous), true],
        /permission/,
      );
    },
  );
}
