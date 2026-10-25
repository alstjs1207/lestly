import assert from "node:assert/strict";

export async function checkAttendance({
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
}) {
  const seed = async ({
    org = orgA,
    student = studentA,
    start = "now()-interval '7 days'",
    end = "now()-interval '7 days'+interval '3 hours'",
    parent = null,
  } = {}) => {
    await asRole("postgres");
    return (
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time,parent_schedule_id) VALUES($1,$2,$3,${start},${end},$4) RETURNING *`,
        [org, student, org === orgA ? 1 : 2, parent],
      )
    ).rows[0];
  };
  const save = (org, changes) =>
    db.query("SELECT save_attendance($1,$2) changed", [
      org,
      JSON.stringify(changes),
    ]);
  const change = (s, status, version = s.attendance_version) => ({
    schedule_id: s.schedule_id,
    version,
    status,
  });
  const get = async (id) =>
    (await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [id]))
      .rows[0];
  const countEvents = async (id) =>
    Number(
      (
        await db.query(
          "SELECT count(*) n FROM attendance_events WHERE schedule_id=$1",
          [id],
        )
      ).rows[0].n,
    );

  await check(
    "attendance batches preserve past reservations, cancel only the selected occurrence and count confirmed participation",
    async () => {
      const a = await seed(),
        b = await seed({
          start: "now()-interval '6 days'",
          end: "now()-interval '6 days'+interval '3 hours'",
          parent: a.schedule_id,
        });
      const future = await seed({
        start: "now()+interval '6 days'",
        end: "now()+interval '6 days 3 hours'",
        parent: a.schedule_id,
      });
      await db.query("UPDATE programs SET instructor_id=1 WHERE program_id=1");
      await asRole("authenticated", adminA);
      assert.deepEqual(
        (
          await db.query(
            "SELECT * FROM get_student_attended_hours(ARRAY[$1]::uuid[],$2)",
            [studentA, orgA],
          )
        ).rows,
        [],
      );
      assert.equal(
        (await save(orgA, [change(a, "PRESENT"), change(b, "ABSENT")])).rows[0]
          .changed,
        2,
      );
      assert.equal((await get(a.schedule_id)).attendance_status, "PRESENT");
      assert.equal((await get(b.schedule_id)).attendance_status, "ABSENT");
      assert.ok((await get(b.schedule_id)).cancelled_at);
      assert.equal(
        (await get(future.schedule_id)).attendance_status,
        "PENDING",
      );
      assert.equal((await get(future.schedule_id)).cancelled_at, null);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM get_student_attended_hours(ARRAY[$1]::uuid[],$2)",
            [studentA, orgA],
          )
        ).rows[0].total_hours,
        3,
      );
      const event = (
        await db.query("SELECT * FROM attendance_events WHERE schedule_id=$1", [
          b.schedule_id,
        ])
      ).rows[0];
      assert.equal(event.actor_profile_id, adminA);
      assert.equal(event.status, "ABSENT");
      assert.equal(event.snapshot.instructor_id, 1);
      assert.ok(event.recorded_at > new Date(event.snapshot.start_time));
      assert.equal(
        (await save(orgA, [change(a, "PRESENT"), change(b, "ABSENT")])).rows[0]
          .changed,
        0,
      );
      assert.equal(await countEvents(b.schedule_id), 1);
    },
  );

  await check(
    "attendance rejects stale competing edits and rolls back the entire mixed batch",
    async () => {
      const a = await seed(),
        b = await seed({
          start: "now()-interval '6 days'",
          end: "now()-interval '6 days'+interval '3 hours'",
        });
      await asRole("authenticated", adminA);
      await save(orgA, [change(a, "PRESENT")]);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [orgA, JSON.stringify([change(b, "ABSENT"), change(a, "ABSENT")])],
        /attendance_conflict/,
      );
      assert.equal((await get(b.schedule_id)).attendance_status, "PENDING");
      assert.equal(await countEvents(b.schedule_id), 0);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [orgA, JSON.stringify([change(a, "PRESENT"), change(a, "ABSENT")])],
        /attendance_invalid_changes/,
      );
    },
  );

  await check(
    "attendance privileges reject students, foreign admins, forged flags and direct table writes",
    async () => {
      const a = await seed({
        start: "now()-interval '1 minute'",
        end: "now()+interval '2 hours'",
      });
      for (const actor of [studentA, adminB]) {
        await asRole("authenticated", actor);
        await blocked(
          "SELECT save_attendance($1,$2)",
          [orgA, JSON.stringify([change(a, "ABSENT")])],
          /attendance_not_authorized/,
        );
      }
      await asRole("anon");
      await blocked(
        "SELECT save_attendance($1,$2)",
        [orgA, JSON.stringify([change(a, "ABSENT")])],
        /permission denied/,
      );
      await asRole("authenticated", adminA);
      await db.query("SELECT set_config('lestly.attendance_write','on',true)");
      await blocked(
        "UPDATE schedules SET attendance_status='PRESENT' WHERE schedule_id=$1",
        [a.schedule_id],
        /attendance_rpc_required/,
      );
      await db.query("SELECT set_config('lestly.attendance_write','',true)");
      await blocked(
        "INSERT INTO attendance_events(organization_id,schedule_id,version,previous_status,status,actor_profile_id,actor_name,snapshot) VALUES($1,$2,1,'PENDING','PRESENT',$3,'spoof','{}')",
        [orgA, a.schedule_id, adminA],
        /permission denied|row-level security/,
      );
      const foreign = await seed({ org: orgB, student: studentB });
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [
          orgA,
          JSON.stringify([change(a, "ABSENT"), change(foreign, "ABSENT")]),
        ],
        /attendance_schedule_changed/,
      );
      assert.equal((await get(a.schedule_id)).attendance_status, "PENDING");
    },
  );

  await check(
    "future attendance is blocked but graduated students' past attendance can be corrected with frozen snapshots",
    async () => {
      const past = await seed(),
        future = await seed({
          start: "now()+interval '3 days'",
          end: "now()+interval '3 days 3 hours'",
        });
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [
          orgA,
          JSON.stringify([change(past, "PRESENT"), change(future, "ABSENT")]),
        ],
        /attendance_not_started/,
      );
      assert.equal((await get(past.schedule_id)).attendance_version, 0);
      await save(orgA, [change(past, "ABSENT")]);
      await asRole("postgres");
      await db.query(
        "UPDATE programs SET title='Renamed class' WHERE program_id=1",
      );
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      );
      await asRole("authenticated", adminA);
      await save(orgA, [change(past, "PRESENT", 1)]);
      assert.equal((await get(past.schedule_id)).cancelled_at, null);
      assert.equal(await countEvents(past.schedule_id), 2);
      const events = (
        await db.query(
          "SELECT * FROM attendance_events WHERE schedule_id=$1 ORDER BY version",
          [past.schedule_id],
        )
      ).rows;
      assert.deepEqual(events[0].snapshot, events[1].snapshot);
      assert.notEqual(events[1].snapshot.program_title, "Renamed class");
      await asRole("authenticated", studentA);
      assert.equal(
        (await db.query("SELECT * FROM attendance_events")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT * FROM get_student_attended_hours(ARRAY[$1]::uuid[])",
            [studentA],
          )
        ).rows[0].total_hours,
        3,
      );
    },
  );

  await check(
    "cancelled places are released and an overlapping replacement prevents unsafe restoration atomically",
    async () => {
      const a = await seed({
        start: "now()-interval '1 hour'",
        end: "now()+interval '2 hours'",
      });
      await asRole("authenticated", adminA);
      await save(orgA, [change(a, "ABSENT")]);
      const replacement = await seed({
        start: "now()-interval '30 minutes'",
        end: "now()+interval '1 hour'",
      });
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [orgA, JSON.stringify([change(a, "PRESENT", 1)])],
        /schedule_student_conflict/,
      );
      assert.equal((await get(a.schedule_id)).attendance_status, "ABSENT");
      assert.equal(await countEvents(a.schedule_id), 1);
      await save(orgA, [
        change(a, "PRESENT", 1),
        change(replacement, "ABSENT"),
      ]);
      assert.equal((await get(a.schedule_id)).attendance_status, "PRESENT");
      assert.equal(
        (await get(replacement.schedule_id)).attendance_status,
        "ABSENT",
      );
    },
  );

  await check(
    "ordinary pending reservation edits invalidate an open attendance draft without locking further edits",
    async () => {
      const a = await seed({
        start: "now()-interval '30 minutes'",
        end: "now()+interval '30 minutes'",
      });
      await asRole("authenticated", adminA);
      for (let i = 0; i < 2; i++)
        await db.query(
          "UPDATE schedules SET start_time=start_time+interval '5 minutes',end_time=end_time+interval '5 minutes' WHERE schedule_id=$1",
          [a.schedule_id],
        );
      assert.equal((await get(a.schedule_id)).attendance_version, 2);
      assert.equal((await get(a.schedule_id)).attendance_updated_at, null);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [orgA, JSON.stringify([change(a, "PRESENT")])],
        /attendance_conflict/,
      );
      await save(orgA, [change(a, "PRESENT", 2)]);
      assert.equal((await get(a.schedule_id)).attendance_version, 3);
      assert.equal(await countEvents(a.schedule_id), 1);
    },
  );

  await check(
    "checked records cannot be erased or moved through direct admin writes",
    async () => {
      const a = await seed({
        start: "now()-interval '1 minute'",
        end: "now()+interval '2 hours'",
      });
      await asRole("authenticated", adminA);
      await save(orgA, [change(a, "PRESENT")]);
      await blocked(
        "DELETE FROM schedules WHERE schedule_id=$1",
        [a.schedule_id],
        /attendance_record_locked/,
      );
      await blocked(
        "UPDATE schedules SET start_time=start_time+interval '1 hour',end_time=end_time+interval '1 hour' WHERE schedule_id=$1",
        [a.schedule_id],
        /attendance_record_locked/,
      );
      await blocked(
        "UPDATE attendance_events SET status='ABSENT' WHERE schedule_id=$1",
        [a.schedule_id],
        /permission denied/,
      );
      await save(orgA, [change(a, "PENDING", 1)]);
      assert.equal((await get(a.schedule_id)).attendance_status, "PENDING");
      assert.equal(await countEvents(a.schedule_id), 2);
    },
  );
}
