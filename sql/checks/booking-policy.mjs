import assert from "node:assert/strict";

const defaults = {
  durationMinutes: [180, 360, 540],
  defaultDurationMinutes: 180,
  firstStart: "09:00",
  lastStart: "20:00",
  startIntervalMinutes: 30,
  leadMinutes: 0,
};
export async function checkBookingPolicyMigration(db, source) {
  await db.exec("BEGIN");
  try {
    const org = "97000000-0000-0000-0000-000000000001",
      student = "97000000-0000-0000-0000-000000000002";
    await db.query(
      "INSERT INTO organizations(organization_id,name) VALUES($1,'Booking upgrade')",
      [org],
    );
    await db.query(
      "INSERT INTO profiles(profile_id,name) VALUES($1,'Existing overnight student')",
      [student],
    );
    await db.query(
      "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
      [org, student],
    );
    await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '1 day',now()+interval '1 day 9 hours')",
      [org, student],
    );
    await db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'time_slot_interval_minutes','{\"value\":15}'),($1,'schedule_duration_hours','{\"value\":4}')",
      [org],
    );
    const snap =
      "SELECT (SELECT jsonb_agg(p ORDER BY profile_id) FROM profiles p) profiles,(SELECT jsonb_agg(m ORDER BY organization_id,profile_id) FROM organization_members m) members,(SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(c ORDER BY organization_id,setting_key) FROM settings c) settings";
    const before = (await db.query(snap)).rows;
    for (const part of source.split("--> statement-breakpoint"))
      if (part.trim()) await db.exec(part);
    assert.deepEqual((await db.query(snap)).rows, before);
    assert.deepEqual(
      (await db.query("SELECT public.read_booking_policy($1) p", [org])).rows[0]
        .p,
      defaults,
    );
    console.log(
      "PASS booking policy upgrade preserves all existing rows and the actual legacy booking defaults",
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}
export async function checkBookingPolicy({
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
  const set = async (p) =>
    db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_policy',$2) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
      [orgA, JSON.stringify(p)],
    );
  const cap = async (n) =>
    db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'max_concurrent_students',jsonb_build_object('value',$2::int)) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
      [orgA, n],
    );
  const tomorrow = async () =>
    (
      await db.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date+1,'YYYY-MM-DD') d",
      )
    ).rows[0].d;
  const seed = async (student, start, end) =>
    (
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING *",
        [orgA, student, start, end],
      )
    ).rows[0];
  const available = async (date, minutes) =>
    (
      await db.query(
        "SELECT * FROM get_student_booking_availability_minutes($1,$2,$3)",
        [orgA, date, minutes],
      )
    ).rows;
  const book = (date, time, minutes) =>
    db.query(
      "SELECT book_student_schedule($1,NULL,($2::date+$3::time) AT TIME ZONE 'Asia/Seoul',(($2::date+$3::time) AT TIME ZONE 'Asia/Seoul')+make_interval(mins=>$4)) id",
      [orgA, date, time, minutes],
    );
  const custom = {
    ...defaults,
    durationMinutes: [40, 50, 90],
    defaultDurationMinutes: 40,
    startIntervalMinutes: 50,
  };
  await check(
    "minute policy drives non-hour-dividing slots, exact lengths, day-end starts and legacy hour RPC compatibility",
    async () => {
      await set(custom);
      const date = await tomorrow();
      await asRole("authenticated", studentA);
      const rows = await available(date, 40);
      assert.deepEqual(
        rows
          .slice(0, 4)
          .map((s) => new Date(s.start_time).toISOString().slice(11, 16)),
        ["00:00", "00:50", "01:40", "02:30"],
      );
      assert.equal(rows.filter((s) => s.available).length, rows.length);
      await blocked(
        "SELECT * FROM get_student_booking_availability_minutes($1,$2,180)",
        [orgA, date],
        /schedule_date_not_allowed/,
      );
      await book(date, "09:00", 40);
      await blocked(
        "SELECT book_student_schedule($1,NULL,($2::date+time '10:00') AT TIME ZONE 'Asia/Seoul',($2::date+time '10:40') AT TIME ZONE 'Asia/Seoul')",
        [orgA, date],
        /schedule_time_not_allowed/,
      );
      await asRole("postgres");
      await set({ ...custom, firstStart: "09:10", lastStart: "11:00" });
      await asRole("authenticated", studentA);
      assert.deepEqual(
        (await available(date, 40)).map((s) =>
          new Date(s.start_time).toISOString().slice(11, 16),
        ),
        ["00:10", "01:00", "01:50"],
      );
      await book(date, "10:50", 40);
      await blocked(
        "SELECT book_student_schedule($1,NULL,($2::date+time '11:00') AT TIME ZONE 'Asia/Seoul',($2::date+time '11:40') AT TIME ZONE 'Asia/Seoul')",
        [orgA, date],
        /schedule_time_not_allowed/,
      );
      await asRole("postgres");
      await set({
        ...custom,
        firstStart: "23:30",
        lastStart: "23:59",
        startIntervalMinutes: 60,
      });
      await asRole("authenticated", studentA);
      await book(date, "23:30", 90);
      const end = (
        await db.query(
          "SELECT to_char(end_time AT TIME ZONE 'Asia/Seoul','HH24:MI') t FROM schedules WHERE student_id=$1 ORDER BY end_time DESC LIMIT 1",
          [studentA],
        )
      ).rows[0].t;
      assert.equal(end, "01:00");
      await asRole("postgres");
      await set(defaults);
      await asRole("authenticated", studentA);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM get_student_booking_availability($1,$2,3)",
            [orgA, date],
          )
        ).rows.length,
        23,
      );
    },
  );
  await check(
    "policy constraints reject malformed privileged writes; student and foreign admin cannot change or read another policy",
    async () => {
      assert.ok(
        (
          await db.query(
            "SELECT provolatile FROM pg_proc WHERE proname IN ('read_booking_policy','schedule_peak_occupancy')",
          )
        ).rows.every((row) => row.provolatile === "v"),
      );
      for (const patch of [
        { durationMinutes: [] },
        { durationMinutes: [40, 40] },
        { defaultDurationMinutes: 49 },
        { startIntervalMinutes: 0 },
        { leadMinutes: -1 },
        { firstStart: "24:00" },
        { lastStart: "08:00" },
        { durationMinutes: [0] },
        { durationMinutes: [1441] },
        { extra: true },
        { leadMinutes: null },
      ])
        await blocked(
          "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_policy',$2)",
          [orgA, JSON.stringify({ ...custom, ...patch })],
          /invalid_booking_policy/,
        );
      await set(custom);
      await asRole("authenticated", studentA);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM settings WHERE organization_id=$1 AND setting_key='booking_policy'",
            [orgA],
          )
        ).rows.length,
        1,
      );
      await blocked(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_policy',$2)",
        [orgA, JSON.stringify(defaults)],
        /row-level security/,
      );
      await blocked(
        "SELECT public.read_booking_policy($1)",
        [orgA],
        /permission denied/,
      );
      await asRole("authenticated", adminB);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM settings WHERE organization_id=$1 AND setting_key='booking_policy'",
            [orgA],
          )
        ).rows.length,
        0,
      );
      await asRole("anon");
      await blocked(
        "SELECT * FROM get_student_booking_availability_minutes($1,current_date,40)",
        [orgA],
        /permission denied/,
      );
    },
  );
  await check(
    "lead-time cutoff, off-grid time blocks and weekdays agree between discovery and writes without rewriting reservations",
    async () => {
      await set({ ...custom, leadMinutes: 43200 });
      const date = await tomorrow();
      const existing = await seed(
        studentA,
        `${date}T09:00:00+09:00`,
        `${date}T09:40:00+09:00`,
      );
      await asRole("authenticated", studentA);
      assert.ok(
        (await available(date, 40)).every((s) => s.reason === "closed"),
      );
      await blocked(
        "SELECT book_student_schedule($1,NULL,($2::date+time '10:40') AT TIME ZONE 'Asia/Seoul',($2::date+time '11:20') AT TIME ZONE 'Asia/Seoul')",
        [orgA, date],
        /schedule_booking_closed/,
      );
      await asRole("postgres");
      assert.deepEqual(
        (
          await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [
            existing.schedule_id,
          ])
        ).rows[0],
        existing,
      );
      await set(custom);
      await db.query(
        'INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,\'disabled_booking_start_times\',\'{"value":["09:50","12:30"]}\')',
        [orgA],
      );
      await asRole("authenticated", studentA);
      assert.equal((await available(date, 40))[1].reason, "disabled");
      await blocked(
        "SELECT book_student_schedule($1,NULL,($2::date+time '09:50') AT TIME ZONE 'Asia/Seoul',($2::date+time '10:30') AT TIME ZONE 'Asia/Seoul')",
        [orgA, date],
        /schedule_time_disabled/,
      );
    },
  );
  const addStudents = async () => {
    const ids = [
      "96000000-0000-0000-0000-000000000001",
      "96000000-0000-0000-0000-000000000002",
    ];
    for (const id of ids) {
      await db.query(
        "INSERT INTO profiles(profile_id,name) VALUES($1,'Peak fixture')",
        [id],
      );
      await db.query(
        "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
        [orgA, id],
      );
    }
    return ids;
  };
  await check(
    "adjacent reservations use one concurrent place and real overlap rejects inserts and multi-row updates atomically",
    async () => {
      const [a, b] = await addStudents();
      const date = await tomorrow();
      await cap(2);
      await seed(a, `${date}T09:00:00+09:00`, `${date}T10:00:00+09:00`);
      await seed(b, `${date}T10:00:00+09:00`, `${date}T11:00:00+09:00`);
      const p = (
        await db.query(
          "SELECT schedule_peak_occupancy($1,($2::date+time '09:00') AT TIME ZONE 'Asia/Seoul',($2::date+time '11:00') AT TIME ZONE 'Asia/Seoul') n",
          [orgA, date],
        )
      ).rows[0].n;
      assert.equal(p, 1);
      await set({
        ...defaults,
        durationMinutes: [120],
        defaultDurationMinutes: 120,
      });
      await asRole("authenticated", studentA);
      assert.equal((await available(date, 120))[0].available, true);
      await book(date, "09:00", 120);
      await asRole("postgres");
      await db.query(
        "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
        [orgA, studentB],
      );
      await blocked(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,($3::date+time '09:00') AT TIME ZONE 'Asia/Seoul',($3::date+time '11:00') AT TIME ZONE 'Asia/Seoul')",
        [orgA, studentB, date],
        /schedule_capacity_exceeded/,
      );
      await blocked(
        "UPDATE schedules SET end_time=($2::date+time '11:00') AT TIME ZONE 'Asia/Seoul' WHERE organization_id=$1 AND student_id=$3",
        [orgA, date, a],
        /schedule_capacity_exceeded/,
      );
    },
  );
  await check(
    "recurring batch moves validate final positions rather than another occurrence's old position",
    async () => {
      const date = await tomorrow();
      const next = new Date(Date.parse(date + "T00:00:00Z") + 7 * 86400000)
        .toISOString()
        .slice(0, 10);
      const last = new Date(Date.parse(date + "T00:00:00Z") + 14 * 86400000)
        .toISOString()
        .slice(0, 10);
      const a = await seed(
          studentA,
          `${date}T09:00:00+09:00`,
          `${date}T12:00:00+09:00`,
        ),
        b = await seed(
          studentA,
          `${next}T09:00:00+09:00`,
          `${next}T12:00:00+09:00`,
        );
      await asRole("authenticated", adminA);
      await db.query("SELECT update_admin_schedule_batch($1,$2,NULL,$3)", [
        orgA,
        studentA,
        JSON.stringify([
          {
            schedule_id: a.schedule_id,
            start_time: `${next}T09:00:00+09:00`,
            end_time: `${next}T12:00:00+09:00`,
          },
          {
            schedule_id: b.schedule_id,
            start_time: `${last}T09:00:00+09:00`,
            end_time: `${last}T12:00:00+09:00`,
          },
        ]),
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM schedules WHERE schedule_id=ANY($1)",
            [[a.schedule_id, b.schedule_id]],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await check(
    "attendance restoration uses peak occupancy and preserves a cancelled lesson after capacity failure",
    async () => {
      const [a, b] = await addStudents();
      await cap(2);
      const day = (
        await db.query(
          "SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date-7,'YYYY-MM-DD') d",
        )
      ).rows[0].d;
      const s = await seed(
        studentA,
        `${day}T09:00:00+09:00`,
        `${day}T11:00:00+09:00`,
      );
      await asRole("authenticated", adminA);
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        JSON.stringify([
          { schedule_id: s.schedule_id, version: 0, status: "ABSENT" },
        ]),
      ]);
      await asRole("postgres");
      await seed(a, `${day}T09:00:00+09:00`, `${day}T10:00:00+09:00`);
      await seed(b, `${day}T10:00:00+09:00`, `${day}T11:00:00+09:00`);
      await asRole("authenticated", adminA);
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        JSON.stringify([
          { schedule_id: s.schedule_id, version: 1, status: "PRESENT" },
        ]),
      ]);
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        JSON.stringify([
          { schedule_id: s.schedule_id, version: 2, status: "ABSENT" },
        ]),
      ]);
      await asRole("postgres");
      await cap(1);
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT save_attendance($1,$2)",
        [
          orgA,
          JSON.stringify([
            { schedule_id: s.schedule_id, version: 3, status: "PRESENT" },
          ]),
        ],
        /schedule_capacity_exceeded/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT attendance_status FROM schedules WHERE schedule_id=$1",
            [s.schedule_id],
          )
        ).rows[0].attendance_status,
        "ABSENT",
      );
    },
  );
}
