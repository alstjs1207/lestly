import assert from "node:assert/strict";

import { bookingWindowRange } from "../../app/features/app-settings/booking-window.ts";
import { toKSTDateString } from "../../app/features/schedules/utils/kst.ts";

const defaults = {
  durationMinutes: [180, 360, 540],
  defaultDurationMinutes: 180,
  firstStart: "09:00",
  lastStart: "20:00",
  startIntervalMinutes: 30,
  leadMinutes: 0,
};

export async function checkBookingWindowMigration(db, source) {
  await db.exec("BEGIN");
  try {
    const org = "96000000-0000-0000-0000-000000000001",
      student = "96000000-0000-0000-0000-000000000002";
    await db.query(
      "INSERT INTO organizations(organization_id,name) VALUES($1,'Window upgrade')",
      [org],
    );
    await db.query(
      "INSERT INTO profiles(profile_id,name) VALUES($1,'Existing window student')",
      [student],
    );
    await db.query(
      "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
      [org, student],
    );
    await db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_policy',$2)",
      [org, JSON.stringify(defaults)],
    );
    await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '90 days',now()+interval '90 days 3 hours')",
      [org, student],
    );
    const snapshot =
      "SELECT (SELECT jsonb_agg(p ORDER BY profile_id) FROM profiles p) profiles,(SELECT jsonb_agg(m ORDER BY organization_id,profile_id) FROM organization_members m) members,(SELECT jsonb_agg(s ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(c ORDER BY organization_id,setting_key) FROM settings c) settings";
    const before = (await db.query(snapshot)).rows;
    for (const part of source.split("--> statement-breakpoint"))
      if (part.trim()) await db.exec(part);
    assert.deepEqual((await db.query(snapshot)).rows, before);
    assert.deepEqual(
      (await db.query("SELECT read_booking_policy($1) p", [org])).rows[0].p,
      defaults,
    );
    assert.deepEqual(
      (await db.query("SELECT read_booking_window($1) w", [org])).rows[0].w,
      { mode: "monthly", openingDay: 25 },
    );
    console.log(
      "PASS booking-window upgrade preserves legacy policies and all existing profiles, memberships and reservations",
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}

export async function checkBookingWindow({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  studentA,
}) {
  const set = (w) =>
    db.query(
      "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_window',$2) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
      [orgA, JSON.stringify(w)],
    );
  const dates = async () =>
    (
      await db.query(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Seoul')::date,'YYYY-MM-DD') today,to_char((now() AT TIME ZONE 'Asia/Seoul')::date+2,'YYYY-MM-DD') last,to_char((now() AT TIME ZONE 'Asia/Seoul')::date+3,'YYYY-MM-DD') outside,to_char((now() AT TIME ZONE 'Asia/Seoul')::date-1,'YYYY-MM-DD') past",
      )
    ).rows[0];
  const book = (date) =>
    db.query(
      "SELECT book_student_schedule($1,NULL,($2::date+time '09:00') AT TIME ZONE 'Asia/Seoul',($2::date+time '12:00') AT TIME ZONE 'Asia/Seoul') id",
      [orgA, date],
    );
  const bookSql =
    "SELECT book_student_schedule($1,NULL,($2::date+time '09:00') AT TIME ZONE 'Asia/Seoul',($2::date+time '12:00') AT TIME ZONE 'Asia/Seoul')";
  const available =
    "SELECT * FROM get_student_booking_availability_minutes($1,$2,180)";

  await check(
    "booking window SQL and browser date boundaries agree at Korean midnight, month-end, leap-year and year-end",
    async () => {
      for (const [instant, w] of [
        ["2026-10-24T14:59:59.999Z", { mode: "monthly", openingDay: 25 }],
        ["2026-10-24T15:00:00Z", { mode: "monthly", openingDay: 25 }],
        ["2026-02-27T23:59:59.999+09:00", { mode: "monthly", openingDay: 31 }],
        ["2026-02-28T00:00:00+09:00", { mode: "monthly", openingDay: 31 }],
        ["2024-02-28T23:59:59.999+09:00", { mode: "monthly", openingDay: 30 }],
        ["2024-02-29T00:00:00+09:00", { mode: "monthly", openingDay: 30 }],
        ["2026-04-30T00:00:00+09:00", { mode: "monthly", openingDay: 31 }],
        ["2026-12-25T00:00:00+09:00", { mode: "monthly", openingDay: 25 }],
        ["2026-10-01T00:00:00+09:00", { mode: "monthly", openingDay: 1 }],
        ["2026-10-29T23:59:59.999+09:00", { mode: "rolling", daysAhead: 14 }],
        ["2026-10-30T00:00:00+09:00", { mode: "rolling", daysAhead: 14 }],
        ["2026-12-31T23:59:59.999+09:00", { mode: "rolling", daysAhead: 0 }],
        ["2024-02-29T00:00:00+09:00", { mode: "rolling", daysAhead: 365 }],
      ]) {
        const end = (
          await db.query("SELECT booking_window_end($1,$2)::text d", [
            JSON.stringify(w),
            instant,
          ])
        ).rows[0].d;
        assert.equal(
          end,
          toKSTDateString(
            bookingWindowRange(w, new Date(instant)).endExclusive,
          ),
          instant,
        );
      }
      const end = (
        await db.query(
          "SELECT booking_window_end($1,'2026-10-24T15:00:00Z')::text d",
          [JSON.stringify({ mode: "monthly", openingDay: 25 })],
        )
      ).rows[0].d;
      assert.equal(end, "2026-12-01");
    },
  );
  await check(
    "booking-window settings reject mixed modes, invalid bounds, missing values and foreign/student writes",
    async () => {
      for (const w of [
        null,
        {},
        { mode: "other" },
        { mode: "monthly", openingDay: 0 },
        { mode: "monthly", openingDay: 32 },
        { mode: "monthly", openingDay: "25" },
        { mode: "monthly", openingDay: 1.5 },
        { mode: "monthly", openingDay: 25, daysAhead: 14 },
        { mode: "rolling", daysAhead: -1 },
        { mode: "rolling", daysAhead: 366 },
        { mode: "rolling", daysAhead: 1.5 },
        { mode: "rolling", daysAhead: 14, openingDay: 25 },
      ])
        await blocked(
          "SELECT validate_booking_window($1)",
          [JSON.stringify(w)],
          /invalid_booking_window/,
        );
      await asRole("authenticated", adminA);
      await set({ mode: "rolling", daysAhead: 14 });
      await blocked(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_window',$2)",
        [orgB, JSON.stringify({ mode: "rolling", daysAhead: 1 })],
        /row-level security/,
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (
          await db.query(
            "UPDATE settings SET setting_value=$2 WHERE organization_id=$1 AND setting_key='booking_window' RETURNING *",
            [orgA, JSON.stringify({ mode: "rolling", daysAhead: 1 })],
          )
        ).rows.length,
        0,
      );
      await blocked(
        "SELECT booking_window_end($1,now())",
        [JSON.stringify(defaults)],
        /permission denied/,
      );
      await asRole("anon");
      await blocked(
        "SELECT booking_window_end($1,now())",
        [JSON.stringify(defaults)],
        /permission denied/,
      );
    },
  );
  await check(
    "invalid window rolls back a whole settings save and preserves the six-field clock policy",
    async () => {
      await asRole("authenticated", adminA);
      await set({ mode: "rolling", daysAhead: 14 });
      const snap =
        "SELECT setting_key,setting_value FROM settings WHERE organization_id=$1 ORDER BY setting_key";
      const before = (await db.query(snap, [orgA])).rows;
      await blocked(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'max_concurrent_students','{\"value\":6}'),($1,'booking_window','{\"mode\":\"both\"}') ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA],
        /invalid_booking_window/,
      );
      assert.deepEqual((await db.query(snap, [orgA])).rows, before);
      await asRole("postgres");
      await db.query("SELECT validate_booking_policy($1)", [
        JSON.stringify(defaults),
      ]);
      await blocked(
        "SELECT validate_booking_policy($1)",
        [
          JSON.stringify({
            ...defaults,
            bookingWindow: { mode: "rolling", daysAhead: 14 },
          }),
        ],
        /invalid_booking_policy/,
      );
    },
  );
  await check(
    "rolling final-day discovery and booking agree and reject tomorrow outside a today-only window",
    async () => {
      const d = await dates();
      await set({ mode: "rolling", daysAhead: 2 });
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      await asRole("authenticated", studentA);
      assert.ok(
        (await db.query(available, [orgA, d.last])).rows.some(
          (s) => s.available,
        ),
      );
      assert.ok((await book(d.last)).rows[0].id);
      await blocked(available, [orgA, d.outside], /schedule_date_not_allowed/);
      await blocked(bookSql, [orgA, d.outside], /schedule_date_not_allowed/);
      await blocked(available, [orgA, d.past], /schedule_date_not_allowed/);
      await asRole("postgres");
      await set({ mode: "rolling", daysAhead: 0 });
      await asRole("authenticated", studentA);
      await blocked(bookSql, [orgA, d.last], /schedule_date_not_allowed/);
      assert.equal(
        (await db.query(available, [orgA, d.today])).rows.length,
        23,
      );
    },
  );
  await check(
    "policy shortening preserves and exposes existing reservations and admins retain direct registration",
    async () => {
      const d = await dates();
      await set({ mode: "rolling", daysAhead: 14 });
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      await asRole("authenticated", studentA);
      const id = (await book(d.outside)).rows[0].id;
      const snap =
        "SELECT to_jsonb(s) row FROM schedules s WHERE schedule_id=$1";
      const before = (await db.query(snap, [id])).rows;
      await asRole("authenticated", adminA);
      await set({ mode: "rolling", daysAhead: 0 });
      await asRole("authenticated", studentA);
      assert.deepEqual((await db.query(snap, [id])).rows, before);
      await blocked(bookSql, [orgA, d.last], /schedule_date_not_allowed/);
      await asRole("authenticated", adminA);
      const created = await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,($3::date+time '09:00') AT TIME ZONE 'Asia/Seoul',($3::date+time '12:00') AT TIME ZONE 'Asia/Seoul') RETURNING schedule_id",
        [orgA, studentA, d.last],
      );
      assert.ok(created.rows[0].schedule_id);
    },
  );
  await check(
    "rolling windows still enforce course end dates, lead time and the current policy on each write",
    async () => {
      const d = await dates();
      await set({ mode: "rolling", daysAhead: 14 });
      await db.query(
        "UPDATE profiles SET class_start_date=NULL,class_end_date=$2 WHERE profile_id=$1",
        [studentA, d.today],
      );
      await asRole("authenticated", studentA);
      assert.ok(
        (await db.query(available, [orgA, d.last])).rows.every(
          (s) => s.reason === "outside_course",
        ),
      );
      await blocked(bookSql, [orgA, d.last], /schedule_outside_course/);
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_end_date=NULL WHERE profile_id=$1",
        [studentA],
      );
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'booking_policy',$2) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [
          orgA,
          JSON.stringify({
            ...defaults,
            leadMinutes: 43200,
          }),
        ],
      );
      await asRole("authenticated", studentA);
      assert.ok(
        (await db.query(available, [orgA, d.last])).rows.every(
          (s) => s.reason === "closed",
        ),
      );
      await blocked(bookSql, [orgA, d.last], /schedule_booking_closed/);
    },
  );
}
