import assert from "node:assert/strict";

export async function checkStudentCourseDates({
  db,
  check,
  asRole,
  blocked,
  source,
  orgA,
  adminA,
  studentA,
}) {
  const snapshot = async () => {
    const result = {};
    for (const { tablename } of (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows) {
      assert.match(tablename, /^[a-z_]+$/);
      result[tablename] = (
        await db.query(
          `SELECT to_jsonb(t) row FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`,
        )
      ).rows;
    }
    return result;
  };
  const before = await snapshot();
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
  assert.deepEqual(await snapshot(), before);
  console.log(
    "PASS course-date migration preserves all existing public rows, reservations, attendance and account access",
  );

  const values = {
    name: "Course dates",
    phone: "01076543210",
    region: null,
    type: "STUDENT",
  };
  const save = (changes, id = null) =>
    db.query("SELECT save_managed_student($1,$2,$3) id", [
      orgA,
      { ...values, ...changes },
      id,
    ]);
  const time = (
    await db.query(
      "SELECT (((now() AT TIME ZONE 'Asia/Seoul')::date+3)+time '10:00') AT TIME ZONE 'Asia/Seoul' t",
    )
  ).rows[0].t;
  const end = new Date(+new Date(time) + 3 * 3600000).toISOString();
  const insert =
    "INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,1,$3,$4)";

  await check(
    "course dates require explicit ends for all new managed profiles and default only the KST start",
    async () => {
      await asRole("authenticated", adminA);
      for (const dates of [{}, { class_start_date: "2026-01-01" }]) {
        await blocked(
          "SELECT save_managed_student($1,$2)",
          [orgA, { ...values, ...dates }],
          /student_course_end_required/,
        );
      }
      const id = (await save({ class_end_date: "2099-12-31" })).rows[0].id;
      const row = (
        await db.query(
          "SELECT class_start_date::text start,class_end_date::text finish,(now() AT TIME ZONE 'Asia/Seoul')::date::text today FROM profiles WHERE profile_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(row.start, row.today);
      assert.equal(row.finish, "2099-12-31");
      await blocked(
        "SELECT save_managed_student($1,$2)",
        [
          orgA,
          { ...values, phone: "01076543211", class_end_date: "2000-01-01" },
        ],
        /invalid_student_values/,
      );
    },
  );

  await check(
    "date-pair validation blocks direct profile writes and keeps null legacy basic edits available",
    async () => {
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      await blocked(
        "UPDATE profiles SET class_start_date='2026-01-01' WHERE profile_id=$1",
        [studentA],
        /student_course_end_required/,
      );
      await db.query(
        "UPDATE profiles SET name='Updated without period' WHERE profile_id=$1",
        [studentA],
      );
      const row = (
        await db.query(
          "SELECT name,class_start_date,class_end_date FROM profiles WHERE profile_id=$1",
          [studentA],
        )
      ).rows[0];
      assert.equal(row.name, "Updated without period");
      assert.equal(row.class_start_date, null);
      await asRole("authenticated", adminA);
      await save({ class_start_date: null, class_end_date: null }, studentA);
    },
  );

  await check(
    "missing course dates block student RPC, administrator series and direct schedule writes while retaining login and existing reservations",
    async () => {
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      const reservations = (
        await db.query(
          "SELECT to_jsonb(s) row FROM schedules s WHERE student_id=$1 ORDER BY schedule_id",
          [studentA],
        )
      ).rows;
      await blocked(
        insert,
        [orgA, studentA, time, end],
        /schedule_course_dates_required/,
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (await db.query("SELECT is_account_access_allowed() allowed")).rows[0]
          .allowed,
        true,
      );
      await blocked(
        "SELECT book_student_schedule($1,1,$2,$3)",
        [orgA, time, end],
        /schedule_course_dates_required/,
      );
      const slots = (
        await db.query(
          "SELECT * FROM get_student_program_booking_availability($1,1,($2::timestamptz AT TIME ZONE 'Asia/Seoul')::date,180)",
          [orgA, time],
        )
      ).rows;
      assert.ok(slots.length > 0);
      assert.ok(
        slots.every(
          (slot) =>
            slot.available === false && slot.reason === "course_dates_required",
        ),
      );
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT create_admin_schedule_series($1,$2,1,$3,NULL)",
        [orgA, studentA, [{ start_time: time, end_time: end }]],
        /schedule_course_dates_required/,
      );
      await asRole("postgres");
      assert.deepEqual(
        (
          await db.query(
            "SELECT to_jsonb(s) row FROM schedules s WHERE student_id=$1 ORDER BY schedule_id",
            [studentA],
          )
        ).rows,
        reservations,
      );
    },
  );

  await check(
    "existing bookings keep attendance and cancellation after dates are cleared; new edits require complete dates",
    async () => {
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_start_date='2000-01-01',class_end_date='2099-12-31' WHERE profile_id=$1",
        [studentA],
      );
      const future = (
        await db.query(`${insert} RETURNING schedule_id`, [
          orgA,
          studentA,
          time,
          end,
        ])
      ).rows[0].schedule_id;
      const past = (
        await db.query(
          "INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,1,now()-interval '10 days',now()-interval '10 days'+interval '3 hours') RETURNING schedule_id,attendance_version",
          [orgA, studentA],
        )
      ).rows[0];
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      await blocked(
        "UPDATE schedules SET start_time=start_time+interval '1 day',end_time=end_time+interval '1 day' WHERE schedule_id=$1",
        [future],
        /schedule_course_dates_required/,
      );
      await asRole("authenticated", adminA);
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        [
          {
            schedule_id: past.schedule_id,
            version: past.attendance_version,
            status: "PRESENT",
          },
        ],
      ]);
      await db.query("DELETE FROM schedules WHERE schedule_id=$1", [future]);
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT attendance_status::text status FROM schedules WHERE schedule_id=$1",
            [past.schedule_id],
          )
        ).rows[0].status,
        "PRESENT",
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM schedules WHERE schedule_id=$1",
            [future],
          )
        ).rows[0].n,
        0,
      );
    },
  );

  await check(
    "registering a complete course allows bookings and inclusive end dates; a legacy missing start still blocks",
    async () => {
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date='2099-12-31' WHERE profile_id=$1",
        [studentA],
      );
      await blocked(
        insert,
        [orgA, studentA, time, end],
        /schedule_course_dates_required/,
      );
      await db.query(
        "UPDATE profiles SET class_start_date=(now() AT TIME ZONE 'Asia/Seoul')::date,class_end_date=($2::timestamptz AT TIME ZONE 'Asia/Seoul')::date WHERE profile_id=$1",
        [studentA, time],
      );
      await asRole("authenticated", adminA);
      await db.query(insert, [orgA, studentA, time, end]);
      await blocked(
        insert,
        [
          orgA,
          studentA,
          new Date(+new Date(time) + 86400000).toISOString(),
          new Date(+new Date(end) + 86400000).toISOString(),
        ],
        /schedule_outside_course/,
      );
    },
  );
}
