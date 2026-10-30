import assert from "node:assert/strict";

export async function checkClassBookingPolicy({
  db,
  check,
  asRole,
  blocked,
  source,
  attendancePatch,
  orgA,
  orgB,
  adminA,
  studentA,
  managedStudent,
}) {
  const snap =
    "SELECT (SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(s ORDER BY organization_id,setting_key) FROM settings s) settings,(SELECT jsonb_agg(s ORDER BY profile_id) FROM profiles s) profiles,(SELECT jsonb_agg(s ORDER BY event_id) FROM attendance_events s) attendance";
  const before = (await db.query(snap)).rows;
  // Upgrade must fail safely if a caller has not explicitly repaired orphan reservations.
  await db.exec("BEGIN");
  try {
    await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '2 days',now()+interval '2 days 3 hours')",
      [orgA, studentA],
    );
    await blocked(
      source.split("--> statement-breakpoint")[0],
      [],
      /unlinked_schedules_require_explicit_repair/,
    );
  } finally {
    await db.exec("ROLLBACK");
  }
  for (const part of source.split("--> statement-breakpoint"))
    if (part.trim()) await db.exec(part);
  await db.exec(attendancePatch);
  assert.deepEqual((await db.query(snap)).rows, before);
  console.log(
    "PASS class-policy upgrade preserves every reservation, cancellation snapshot, profile, attendance event and organization setting",
  );
  const program = async (id = 1) =>
    (await db.query("SELECT * FROM programs WHERE program_id=$1", [id]))
      .rows[0];
  const allowed = (await program()).booking_duration_minutes;
  assert.deepEqual(allowed, [120, 180, 360, 540]);
  assert.equal((await program()).max_capacity, 5);
  const make = async ({
    org = orgA,
    capacity = 1,
    minutes = 60,
    status = "ACTIVE",
  } = {}) =>
    (
      await db.query(
        "INSERT INTO programs(organization_id,title,status,duration_minutes,booking_duration_minutes,max_capacity) VALUES($1,'Class rule fixture',$2,$3,ARRAY[$3::int],$4) RETURNING program_id",
        [org, status, minutes, capacity],
      )
    ).rows[0].program_id;
  const seed = async (
    p,
    student = studentA,
    start = "now()+interval '1 day'",
    mins = 60,
  ) =>
    (
      await db.query(
        `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,$3,${start},${start}+make_interval(mins=>$4::int)) RETURNING *`,
        [orgA, student, p, mins],
      )
    ).rows[0];
  const insert =
    "INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,$3,now()+interval '1 day',now()+interval '1 day'+make_interval(mins=>$4::int))";
  await check(
    "new classes copy current defaults once; later organization edits never propagate",
    async () => {
      await db.query(
        'INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,\'max_concurrent_students\',\'{"value":7}\'),($1,\'booking_policy\',\'{"durationMinutes":[40,50],"defaultDurationMinutes":50,"firstStart":"09:00","lastStart":"20:00","startIntervalMinutes":30,"leadMinutes":0}\')',
        [orgA],
      );
      const p = (
        await db.query(
          "INSERT INTO programs(organization_id,title) VALUES($1,'Copies defaults') RETURNING *",
          [orgA],
        )
      ).rows[0];
      assert.equal(p.duration_minutes, 50);
      assert.deepEqual(p.booking_duration_minutes, [40, 50]);
      assert.equal(p.max_capacity, 7);
      await db.query(
        "UPDATE settings SET setting_value='{\"value\":1}' WHERE organization_id=$1 AND setting_key='max_concurrent_students'",
        [orgA],
      );
      await db.query(
        "UPDATE settings SET setting_value=jsonb_set(jsonb_set(setting_value,'{durationMinutes}','[90]'),'{defaultDurationMinutes}','90') WHERE organization_id=$1 AND setting_key='booking_policy'",
        [orgA],
      );
      assert.deepEqual(await program(p.program_id), p);
      const next = (
        await db.query(
          "INSERT INTO programs(organization_id,title) VALUES($1,'Next defaults') RETURNING *",
          [orgA],
        )
      ).rows[0];
      assert.deepEqual(next.booking_duration_minutes, [90]);
      assert.equal(next.max_capacity, 1);
    },
  );
  await check(
    "class fields reject invalid limits, duplicate lengths and a default outside the allowed list",
    async () => {
      for (const patch of [
        "max_capacity=0",
        "max_capacity=101",
        "duration_minutes=0",
        "booking_duration_minutes=ARRAY[180,180]",
        "booking_duration_minutes=ARRAY[180]",
        "booking_duration_minutes=ARRAY[]::int[]",
        "booking_duration_minutes=ARRAY[120,NULL]",
        "booking_duration_minutes=ARRAY[120,1441]",
      ])
        await blocked(
          `UPDATE programs SET ${patch} WHERE program_id=1`,
          [],
          /programs_booking_fields_check|invalid_program_booking_policy/,
        );
    },
  );
  await check(
    "reservations require an active class in the same organization for all writers",
    async () => {
      await blocked(
        insert,
        [orgA, studentA, null, 180],
        /schedule_program_required/,
      );
      await blocked(
        insert,
        [orgA, studentA, 2, 180],
        /schedule_program_not_eligible/,
      );
      const p = await make({ status: "DRAFT" });
      await blocked(
        insert,
        [orgA, studentA, p, 60],
        /schedule_program_not_eligible/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        insert,
        [orgA, studentA, null, 180],
        /schedule_program_required/,
      );
    },
  );
  await check(
    "class duration is authoritative for admin and student writes regardless of organization default",
    async () => {
      const p = await make();
      await seed(p);
      await blocked(
        insert,
        [orgA, managedStudent, p, 180],
        /schedule_time_not_allowed/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        insert,
        [orgA, managedStudent, p, 120],
        /schedule_time_not_allowed/,
      );
    },
  );
  await check(
    "different classes each have their own seat; student overlap remains global across classes",
    async () => {
      const a = await make(),
        b = await make();
      await seed(a);
      await seed(b, managedStudent);
      await blocked(
        insert,
        [orgA, managedStudent, a, 60],
        /schedule_student_conflict/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT program_peak_occupancy($1,$2,now()+interval '1 day',now()+interval '1 day 1 hour') n",
            [orgA, a],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "same-class capacity rejects excess bookings and a full-class reassignment",
    async () => {
      const a = await make(),
        b = await make();
      await seed(a);
      await blocked(
        insert,
        [orgA, managedStudent, a, 60],
        /schedule_capacity_exceeded/,
      );
      const row = await seed(b, managedStudent);
      await blocked(
        "UPDATE schedules SET program_id=$1 WHERE schedule_id=$2",
        [a, row.schedule_id],
        /schedule_capacity_exceeded/,
      );
    },
  );
  await check(
    "capacity counts peak overlap, with touching reservations reusing the seat",
    async () => {
      const p = await make();
      await seed(p, studentA, "now()+interval '1 day'", 60);
      await seed(p, managedStudent, "now()+interval '1 day 1 hour'", 60);
      assert.equal(
        (
          await db.query(
            "SELECT program_peak_occupancy($1,$2,now()+interval '1 day',now()+interval '1 day 2 hours') n",
            [orgA, p],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await check(
    "existing exact lengths and cancellation snapshots survive a class policy change",
    async () => {
      const row = (await db.query("SELECT * FROM schedules WHERE program_id=1"))
        .rows[0];
      await db.query(
        "UPDATE programs SET duration_minutes=50,booking_duration_minutes=ARRAY[50],max_capacity=1 WHERE program_id=1",
      );
      assert.deepEqual(
        (
          await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [
            row.schedule_id,
          ])
        ).rows[0],
        row,
      );
      await db.query(
        "UPDATE schedules SET start_time=start_time+interval '1 hour',end_time=end_time+interval '1 hour' WHERE schedule_id=$1",
        [row.schedule_id],
      );
      const after = (
        await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [
          row.schedule_id,
        ])
      ).rows[0];
      assert.equal(
        +after.end_time - +after.start_time,
        +row.end_time - +row.start_time,
      );
      assert.deepEqual(after.cancellation_policy, row.cancellation_policy);
    },
  );
  await check(
    "classes with reservations cannot be deleted or moved between organizations",
    async () => {
      await blocked(
        "DELETE FROM programs WHERE program_id=1",
        [],
        /schedules_program_(tenant_fk|id_programs_program_id_fk)/,
      );
      await blocked(
        "UPDATE programs SET organization_id=$1 WHERE program_id=1",
        [orgB],
        /program_identity_update_not_allowed/,
      );
    },
  );
  await check(
    "student availability uses the selected class duration and capacity and rejects tenant spoofing",
    async () => {
      const a = await make(),
        b = await make();
      const day = (
        await db.query(
          "SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+1)::text d",
        )
      ).rows[0].d;
      await seed(a, managedStudent, `'${day}T09:00:00+09:00'::timestamptz`, 60);
      await asRole("authenticated", studentA);
      const slots = async (p) =>
        (
          await db.query(
            "SELECT * FROM get_student_program_booking_availability($1,$2,$3,60)",
            [orgA, p, day],
          )
        ).rows;
      assert.equal((await slots(a))[0].reason, "capacity");
      assert.equal((await slots(b))[0].available, true);
      await blocked(
        "SELECT * FROM get_student_program_booking_availability($1,$2,$3,180)",
        [orgA, b, day],
        /schedule_date_not_allowed/,
      );
      await blocked(
        "SELECT * FROM get_student_program_booking_availability($1,2,$2,60)",
        [orgA, day],
        /schedule_program_not_eligible/,
      );
      await blocked(
        "SELECT * FROM get_student_program_booking_availability($1,2,$2,60)",
        [orgB, day],
        /schedule_not_authorized/,
      );
    },
  );
  await check(
    "attendance restoration checks capacity only in its own class and preserves cancellation policy",
    async () => {
      const a = await make(),
        b = await make();
      const s = await seed(a, studentA, "now()-interval '5 days'"),
        other = await seed(b, managedStudent, "now()-interval '5 days'");
      await asRole("authenticated", adminA);
      const save = (status, version) =>
        db.query("SELECT save_attendance($1,$2)", [
          orgA,
          JSON.stringify([{ schedule_id: s.schedule_id, status, version }]),
        ]);
      await save("ABSENT", 0);
      await save("PRESENT", 1);
      const restored = (
        await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [
          s.schedule_id,
        ])
      ).rows[0];
      assert.equal(restored.cancelled_at, null);
      assert.deepEqual(restored.cancellation_policy, s.cancellation_policy);
      await save("ABSENT", 2);
      await asRole("postgres");
      await db.query(
        "UPDATE schedules SET program_id=$1 WHERE schedule_id=$2",
        [a, other.schedule_id],
      );
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [
          orgA,
          JSON.stringify([
            { schedule_id: s.schedule_id, status: "PRESENT", version: 3 },
          ]),
        ],
        /schedule_capacity_exceeded/,
      );
    },
  );
  await check(
    "repeat admin RPC enforces class policy atomically without allowing partial series",
    async () => {
      const p = await make();
      await asRole("authenticated", adminA);
      const base = Date.now() + 86400000;
      const rows = [60, 120].map((n, i) => ({
        start_time: new Date(base + i * 86400000).toISOString(),
        end_time: new Date(base + i * 86400000 + n * 60000).toISOString(),
      }));
      await blocked(
        "SELECT create_admin_schedule_series($1,$2,$3,$4,NULL)",
        [orgA, studentA, p, JSON.stringify(rows)],
        /schedule_time_not_allowed/,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE program_id=$1",
              [p],
            )
          ).rows[0].n,
        ),
        0,
      );
    },
  );
  await check(
    "lowering class capacity keeps attendance confirmation available for existing active reservations",
    async () => {
      const p = await make({ capacity: 2 });
      const a = await seed(p, studentA, "now()-interval '5 days'"),
        b = await seed(p, managedStudent, "now()-interval '5 days'");
      await db.query("UPDATE programs SET max_capacity=1 WHERE program_id=$1", [
        p,
      ]);
      await asRole("authenticated", adminA);
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        JSON.stringify([
          { schedule_id: a.schedule_id, version: 0, status: "PRESENT" },
          { schedule_id: b.schedule_id, version: 0, status: "PRESENT" },
        ]),
      ]);
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE program_id=$1 AND attendance_status='PRESENT'",
              [p],
            )
          ).rows[0].n,
        ),
        2,
      );
    },
  );
  await check(
    "internal class policy functions cannot be called by students or anonymous users; lookup index exists",
    async () => {
      const perms = (
        await db.query(
          "SELECT has_function_privilege('anon','get_student_program_booking_availability(uuid,bigint,date,integer)','EXECUTE') a,has_function_privilege('authenticated','get_student_program_booking_availability(uuid,bigint,date,integer)','EXECUTE') s,has_function_privilege('authenticated','read_program_booking_policy(uuid,bigint)','EXECUTE') internal",
        )
      ).rows[0];
      assert.deepEqual(perms, { a: false, s: true, internal: false });
      assert.match(
        (
          await db.query(
            "SELECT indexdef FROM pg_indexes WHERE indexname='schedules_program_start_active_idx'",
          )
        ).rows[0].indexdef,
        /organization_id, program_id, start_time/,
      );
    },
  );
}
