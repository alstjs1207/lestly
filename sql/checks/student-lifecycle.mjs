import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

export async function checkStudentLifecycle({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  adminB,
  studentA,
  studentB,
  studentEditBaseline,
}) {
  const impact = async (state, end = null) =>
    (
      await db.query("SELECT get_student_change_impact($1,$2,$3,$4) impact", [
        orgA,
        studentA,
        state,
        end,
      ])
    ).rows[0].impact;
  const change = async (state, token) =>
    db.query("SELECT set_student_state($1,$2,$3,$4)", [
      orgA,
      studentA,
      state,
      token,
    ]);
  const seedFuture = async (day = 3) =>
    (
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time)
    SELECT $1,$2,1,t,t+interval '3 hours' FROM (SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+$3::int)::timestamp AT TIME ZONE 'Asia/Seoul'+interval '10 hours' t) x RETURNING schedule_id`,
        [orgA, studentA, day],
      )
    ).rows[0].schedule_id;
  const state = async () =>
    (
      await db.query(
        "SELECT state FROM organization_members WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      )
    ).rows[0].state;

  await check(
    "lifecycle requires confirmation, then graduates and atomically cancels every future recurrence while keeping completed hours",
    async () => {
      await db.query("UPDATE programs SET instructor_id=1 WHERE program_id=1");
      const a = await seedFuture(3),
        b = await seedFuture(10);
      await db.query(
        "UPDATE schedules SET parent_schedule_id=$1 WHERE schedule_id=$2",
        [a, b],
      );
      await asRole("authenticated", adminA);
      const before = (
        await db.query(
          "SELECT get_student_completed_hours(ARRAY[$1]::uuid[]) h",
          [studentA],
        )
      ).rows;
      const i = await impact("GRADUATE");
      assert.equal(Number(i.cancel_count), 2);
      await blocked(
        "SELECT set_student_state($1,$2,$3,NULL)",
        [orgA, studentA, "GRADUATE"],
        /student_change_confirmation_required/,
      );
      assert.equal(await state(), "NORMAL");
      await change("GRADUATE", i.token);
      assert.equal(await state(), "GRADUATE");
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE student_id=$1 AND start_time>now()",
              [studentA],
            )
          ).rows[0].n,
        ),
        0,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT get_student_completed_hours(ARRAY[$1]::uuid[]) h",
            [studentA],
          )
        ).rows,
        before,
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (await db.query("SELECT is_account_access_allowed() allowed")).rows[0]
          .allowed,
        true,
      );
      assert.equal((await db.query("SELECT * FROM schedules")).rows.length, 1);
      assert.equal(
        (await db.query("SELECT * FROM organizations")).rows.length,
        1,
      );
      assert.equal((await db.query("SELECT * FROM programs")).rows.length, 1);
      assert.equal(
        (await db.query("SELECT * FROM instructors")).rows.length,
        1,
      );
      await asRole("postgres");
      await blocked(
        `INSERT INTO student_invites(organization_id,profile_id,token_hash,expires_at,created_by_profile_id) VALUES($1,$2,'inactive-invite',now()+interval '1 day',$3)`,
        [orgA, studentA, adminA],
        /student_not_eligible/,
      );
      await asRole("authenticated", studentA);
      await blocked(
        `SELECT book_student_schedule($1,1,now()+interval '3 days',now()+interval '3 days 3 hours')`,
        [orgA],
        /schedule_not_authorized/,
      );
    },
  );

  await check(
    "lifecycle rejects stale confirmations after a new booking without cancelling either reservation",
    async () => {
      await seedFuture(3);
      await asRole("authenticated", adminA);
      const i = await impact("GRADUATE");
      await asRole("postgres");
      await seedFuture(10);
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT set_student_state($1,$2,$3,$4)",
        [orgA, studentA, "GRADUATE", i.token],
        /student_change_confirmation_required/,
      );
      assert.equal(await state(), "NORMAL");
      assert.equal(Number((await impact("GRADUATE")).cancel_count), 2);
    },
  );

  await check(
    "lifecycle blocks graduation and withdrawal during an ongoing lesson",
    async () => {
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,1,now()-interval '1 hour',now()+interval '2 hours')`,
        [orgA, studentA],
      );
      await asRole("authenticated", adminA);
      for (const target of ["GRADUATE", "DELETED"])
        await blocked(
          "SELECT set_student_state($1,$2,$3,NULL)",
          [orgA, studentA, target],
          /student_lesson_in_progress/,
        );
      assert.equal(await state(), "NORMAL");
    },
  );

  await check(
    "lifecycle cancellation failure rolls back the student state and all reservation deletions",
    async () => {
      await seedFuture(3);
      await seedFuture(10);
      await db.exec(`CREATE FUNCTION fail_lifecycle_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cancel_failed'; END $$;
      CREATE TRIGGER fail_lifecycle_delete BEFORE DELETE ON schedules FOR EACH ROW EXECUTE FUNCTION fail_lifecycle_delete();`);
      await asRole("authenticated", adminA);
      const i = await impact("GRADUATE");
      await blocked(
        "SELECT set_student_state($1,$2,$3,$4)",
        [orgA, studentA, "GRADUATE", i.token],
        /cancel_failed/,
      );
      assert.equal(await state(), "NORMAL");
      assert.equal(Number((await impact("GRADUATE")).cancel_count), 2);
    },
  );

  await check(
    "withdrawal revokes refresh sessions, rejects existing JWTs at RLS and restores only a new login after re-enrollment",
    async () => {
      await db.exec(
        "CREATE TABLE IF NOT EXISTS auth.sessions(id uuid PRIMARY KEY,user_id uuid)",
      );
      await db.query(`INSERT INTO auth.sessions VALUES(gen_random_uuid(),$1)`, [
        studentA,
      ]);
      await asRole("authenticated", adminA);
      const i = await impact("DELETED");
      await change("DELETED", i.token);
      await asRole("postgres");
      assert.equal(
        (
          await db.query("SELECT * FROM auth.sessions WHERE user_id=$1", [
            studentA,
          ])
        ).rows.length,
        0,
      );
      await asRole("authenticated", studentA, { iat: 1 });
      assert.equal(
        (await db.query("SELECT is_account_access_allowed() allowed")).rows[0]
          .allowed,
        false,
      );
      assert.equal((await db.query("SELECT * FROM profiles")).rows.length, 0);
      assert.equal((await db.query("SELECT * FROM schedules")).rows.length, 0);
      await asRole("authenticated", adminA);
      await change("NORMAL", null);
      await asRole("authenticated", studentA, { iat: 1 });
      assert.equal(
        (await db.query("SELECT is_account_access_allowed() allowed")).rows[0]
          .allowed,
        false,
      );
      await asRole("authenticated", studentA, {
        iat: Math.ceil(Date.now() / 1000) + 5,
      });
      assert.equal(
        (await db.query("SELECT is_account_access_allowed() allowed")).rows[0]
          .allowed,
        true,
      );
      assert.equal((await db.query("SELECT * FROM schedules")).rows.length, 1);
    },
  );

  await check(
    "lifecycle revokes unused invites, cancels queued notifications and prevents workers from claiming cancelled messages",
    async () => {
      const id = await seedFuture(3);
      await db.query(
        `INSERT INTO student_invites(organization_id,profile_id,token_hash,expires_at,created_by_profile_id) VALUES($1,$2,'lifecycle-invite',now()+interval '1 day',$3)`,
        [orgA, studentA, adminA],
      );
      const n = (
        await db.query(
          `INSERT INTO notifications(organization_id,type,recipient_phone,recipient_profile_id,schedule_id,alimtalk_status,email_status)
      VALUES($1,'ALIMTALK','01011112222',$2,$3,'PENDING','PENDING') RETURNING notification_id`,
          [orgA, studentA, id],
        )
      ).rows[0].notification_id;
      await asRole("authenticated", adminA);
      const i = await impact("GRADUATE");
      await change("GRADUATE", i.token);
      await asRole("postgres");
      assert.ok(
        (
          await db.query(
            `SELECT revoked_at FROM student_invites WHERE token_hash='lifecycle-invite'`,
          )
        ).rows[0].revoked_at,
      );
      const row = (
        await db.query("SELECT * FROM notifications WHERE notification_id=$1", [
          n,
        ])
      ).rows[0];
      assert.ok(row.delivery_cancelled_at);
      assert.equal(row.schedule_id, null);
      assert.equal(row.email_status, "SKIPPED");
      await db.query(
        "UPDATE organization_members SET state='NORMAL' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      );
      await db.query(
        "UPDATE notifications SET delivery_cancelled_at=NULL,email_status='PENDING' WHERE notification_id=$1",
        [n],
      );
      const retained = (
        await db.query(
          "SELECT delivery_cancelled_at,email_status FROM notifications WHERE notification_id=$1",
          [n],
        )
      ).rows[0];
      assert.ok(retained.delivery_cancelled_at);
      assert.equal(retained.email_status, "SKIPPED");
      await asRole("service_role");
      assert.equal(
        (
          await db.query(
            "SELECT can_deliver_student_notification($1) allowed",
            [n],
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await db.query(
            `UPDATE notifications SET alimtalk_status='SENDING' WHERE notification_id=$1 RETURNING notification_id`,
            [n],
          )
        ).rows.length,
        0,
      );
    },
  );

  await check(
    "admin single bookings and updates respect inclusive KST course dates; shortening cancels only future starts after the new end",
    async () => {
      const first = await seedFuture(3),
        last = await seedFuture(10);
      const end = (
        await db.query(
          `SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+3)::text e`,
        )
      ).rows[0].e;
      await asRole("authenticated", adminA);
      const i = await impact("NORMAL", end);
      assert.equal(Number(i.cancel_count), 1);
      const values = {
        name: "Student",
        phone: "01033334444",
        region: "Seoul",
        type: "EXAMINEE",
        state: "NORMAL",
        class_end_date: end,
        lifecycle_confirmation: i.token,
      };
      await db.query("SELECT save_managed_student($1,$2,$3)", [
        orgA,
        JSON.stringify(values),
        studentA,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT schedule_id FROM schedules WHERE schedule_id=$1",
            [first],
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT schedule_id FROM schedules WHERE schedule_id=$1",
            [last],
          )
        ).rows.length,
        0,
      );
      await blocked(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) SELECT $1,$2,1,t,t+interval '3 hours' FROM (SELECT ($3::date+1)::timestamp AT TIME ZONE 'Asia/Seoul' t) x`,
        [orgA, studentA, end],
        /schedule_outside_course/,
      );
      await blocked(
        `UPDATE schedules SET start_time=($2::date+1)::timestamp AT TIME ZONE 'Asia/Seoul',end_time=(($2::date+1)::timestamp AT TIME ZONE 'Asia/Seoul')+interval '3 hours' WHERE schedule_id=$1`,
        [first, end],
        /schedule_outside_course/,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE student_id=$1 AND end_time<=now()",
              [studentA],
            )
          ).rows[0].n,
        ),
        1,
      );
    },
  );

  await check(
    "foreign admins and students cannot change another student state or cancellation scope",
    async () => {
      await seedFuture(3);
      for (const user of [adminB, studentA, studentB]) {
        await asRole("authenticated", user);
        await blocked(
          "SELECT set_student_state($1,$2,$3,NULL)",
          [orgA, studentA, "DELETED"],
          /student_not_authorized/,
        );
      }
      await asRole("postgres");
      assert.equal(await state(), "NORMAL");
    },
  );

  await check(
    "shortening a shared student profile does not cancel another tenant reservations",
    async () => {
      await db.query(
        `INSERT INTO organization_members(organization_id,profile_id,role) VALUES($1,$2,'STUDENT')`,
        [orgB, studentA],
      );
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_managed_student($1,$2,$3)",
        [
          orgA,
          JSON.stringify({
            name: "Student",
            phone: "01033334444",
            region: "Seoul",
            type: "EXAMINEE",
            state: "NORMAL",
            class_end_date: "2099-01-01",
          }),
          studentA,
        ],
        /course_period_shared_profile/,
      );
    },
  );
  await check(
    "admin series creation is atomic when a later occurrence exceeds the course end",
    async () => {
      const start = (
        await db.query(
          "SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+3)::text e",
        )
      ).rows[0].e;
      await db.query(
        "UPDATE profiles SET class_end_date=$1 WHERE profile_id=$2",
        [start, studentA],
      );
      const rows = [
        {
          start_time: start + "T10:00:00+09:00",
          end_time: start + "T13:00:00+09:00",
        },
        {
          start_time: "2099-01-01T10:00:00+09:00",
          end_time: "2099-01-01T13:00:00+09:00",
        },
      ];
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT create_admin_schedule_series($1,$2,1,$3,$4)",
        [orgA, studentA, JSON.stringify(rows), "FREQ=WEEKLY"],
        /schedule_outside_course/,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE student_id=$1 AND start_time>now()",
              [studentA],
            )
          ).rows[0].n,
        ),
        0,
      );
    },
  );
  await check(
    "admin batch update rolls back all occurrences when one target is outside the course period",
    async () => {
      const a = await seedFuture(3),
        b = await seedFuture(10);
      const end = (
        await db.query(
          "SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+12)::text e",
        )
      ).rows[0].e;
      await db.query(
        "UPDATE profiles SET class_end_date=$1 WHERE profile_id=$2",
        [end, studentA],
      );
      const before = (
        await db.query(
          "SELECT schedule_id,start_time,end_time FROM schedules WHERE schedule_id IN ($1,$2) ORDER BY schedule_id",
          [a, b],
        )
      ).rows;
      const rows = before.map((r, index) => ({
        schedule_id: r.schedule_id,
        start_time: index
          ? "2099-01-01T10:00:00+09:00"
          : new Date(new Date(r.start_time).getTime() + 3600000).toISOString(),
        end_time: index
          ? "2099-01-01T13:00:00+09:00"
          : new Date(new Date(r.end_time).getTime() + 3600000).toISOString(),
      }));
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT update_admin_schedule_batch($1,$2,1,$3)",
        [orgA, studentA, JSON.stringify(rows)],
        /schedule_outside_course/,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT schedule_id,start_time,end_time FROM schedules WHERE schedule_id IN ($1,$2) ORDER BY schedule_id",
            [a, b],
          )
        ).rows,
        before,
      );
    },
  );
  await check(
    "admin series creation and batch update keep the root link and use the same tenant boundary",
    async () => {
      const rows = [3, 10, 17].map((day) => ({
        start_time: new Date(Date.now() + day * 86400000).toISOString(),
        end_time: new Date(
          Date.now() + day * 86400000 + 10800000,
        ).toISOString(),
      }));
      await asRole("authenticated", adminA);
      await db.query("SELECT create_admin_schedule_series($1,$2,1,$3,$4)", [
        orgA,
        studentA,
        JSON.stringify(rows),
        "FREQ=WEEKLY",
      ]);
      const saved = (
        await db.query(
          "SELECT schedule_id,parent_schedule_id,start_time,end_time FROM schedules WHERE student_id=$1 AND start_time>now() ORDER BY start_time",
          [studentA],
        )
      ).rows;
      assert.equal(saved.length, 3);
      assert.equal(saved[0].parent_schedule_id, null);
      assert.ok(
        saved
          .slice(1)
          .every((r) => r.parent_schedule_id === saved[0].schedule_id),
      );
      await asRole("authenticated", adminB);
      await blocked(
        "SELECT update_admin_schedule_batch($1,$2,1,$3)",
        [orgA, studentA, JSON.stringify(saved)],
        /schedule_not_authorized/,
      );
    },
  );
  const editValues = async () => {
    await db.query(
      "UPDATE organization_members SET type='EXAMINEE' WHERE organization_id=$1 AND profile_id=$2",
      [orgA, studentA],
    );
    return (
      await db.query(
        `SELECT jsonb_build_object(
    'name','Edited name','phone','01033334444','region','Seoul','type',m.type,'state',m.state,
    'class_start_date',p.class_start_date,'class_end_date',p.class_end_date) v
    FROM profiles p JOIN organization_members m USING(profile_id)
    WHERE p.profile_id=$1 AND m.organization_id=$2`,
        [studentA, orgA],
      )
    ).rows[0].v;
  };
  await check(
    "ordinary edits bypass cancellation checks while destructive edits still require them",
    async () => {
      const values = await editValues();
      await db.exec(`CREATE OR REPLACE FUNCTION public.get_student_change_impact(p_organization_id uuid,p_student_id uuid,p_state public.user_state,p_end date)
      RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'unexpected_impact_check'; END $$`);
      await asRole("authenticated", adminA);
      await db.query("SELECT save_managed_student($1,$2,$3)", [
        orgA,
        values,
        studentA,
      ]);
      assert.equal(
        (
          await db.query("SELECT name FROM profiles WHERE profile_id=$1", [
            studentA,
          ])
        ).rows[0].name,
        "Edited name",
      );
      // If the helper was bypassed for destructive changes, this sentinel would not fire.
      await blocked(
        "SELECT save_managed_student($1,$2,$3)",
        [orgA, { ...values, state: "GRADUATE" }, studentA],
        /unexpected_impact_check/,
      );
      await blocked(
        "SELECT save_managed_student($1,$2,$3)",
        [orgA, { ...values, class_end_date: "2098-01-01" }, studentA],
        /unexpected_impact_check/,
      );
    },
  );
  await check(
    "ordinary edits never overwrite a lifecycle change committed after their initial read",
    async () => {
      const values = await editValues();
      // Change lifecycle fields between the initial read and ordinary profile UPDATE.
      await db.exec(`CREATE FUNCTION public.simulate_concurrent_student_change() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
        UPDATE public.organization_members SET state='GRADUATE' WHERE profile_id=NEW.profile_id AND role='STUDENT';
        NEW.class_end_date := '2098-01-01';
        RETURN NEW;
      END $$;
      CREATE TRIGGER simulate_concurrent_student_change BEFORE UPDATE OF name ON profiles
        FOR EACH ROW EXECUTE FUNCTION public.simulate_concurrent_student_change()`);
      await asRole("authenticated", adminA);
      await db.query("SELECT save_managed_student($1,$2,$3)", [
        orgA,
        values,
        studentA,
      ]);
      assert.equal(await state(), "GRADUATE");
      assert.equal(
        (
          await db.query(
            "SELECT class_end_date::text e FROM profiles WHERE profile_id=$1",
            [studentA],
          )
        ).rows[0].e,
        "2098-01-01",
      );
    },
  );
  await check(
    "ordinary edits on shared profiles remain allowed while date edits stay protected",
    async () => {
      const values = await editValues();
      await db.query(
        "INSERT INTO organization_members(organization_id,profile_id,role) VALUES($1,$2,'STUDENT')",
        [orgB, studentA],
      );
      await asRole("authenticated", adminA);
      await db.query("SELECT save_managed_student($1,$2,$3)", [
        orgA,
        values,
        studentA,
      ]);
      await blocked(
        "SELECT save_managed_student($1,$2,$3)",
        [orgA, { ...values, class_start_date: "2020-01-01" }, studentA],
        /course_period_shared_profile/,
      );
    },
  );
  await check(
    "ordinary edit benchmark compares the previous function on the same student",
    async () => {
      const values = await editValues();
      const current = (
        await db.query(
          "SELECT pg_get_functiondef('public.save_managed_student(uuid,jsonb,uuid)'::regprocedure) definition",
        )
      ).rows[0].definition;
      const measurements = {};
      for (const [label, definition] of [
        ["before", studentEditBaseline],
        ["after", current],
      ]) {
        await asRole("postgres");
        await db.exec(definition);
        await asRole("authenticated", adminA);
        const times = [];
        for (let i = 0; i < 8; i++) {
          const plan = (
            await db.query(
              "EXPLAIN (ANALYZE,FORMAT JSON) SELECT save_managed_student($1,$2,$3)",
              [orgA, values, studentA],
            )
          ).rows[0]["QUERY PLAN"][0];
          if (i) times.push(plan["Execution Time"]);
        }
        measurements[label] = {
          medianMs: [...times].sort((a, b) => a - b)[3],
          samples: times,
        };
      }
      await mkdir("test-results", { recursive: true });
      await writeFile(
        "test-results/student-edit-performance.json",
        JSON.stringify({ runtime: "PGlite", ...measurements }, null, 2) + "\n",
      );
      console.log("Student edit benchmark:", JSON.stringify(measurements));
    },
  );
}
