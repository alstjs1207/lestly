import assert from "node:assert/strict";

import { bridge } from "../../tests/helpers/reservation-db-bridge.mjs";

export async function checkBookingLifecycle(ctx) {
  const { db, check, asRole, blocked, orgA, adminA, studentA, managedStudent } =
    ctx;
  const results = [];
  const run = async (name, area, issues, fn) => {
    try {
      let details;
      await check(name, async () => {
        details = await fn();
      });
      results.push({
        name,
        area,
        status: details?.policyQuestion ? "policy_review" : "verified",
        covers: issues,
        details,
      });
    } catch (e) {
      results.push({
        name,
        area,
        status: "unexpected_failure",
        error: e.message,
      });
      console.error("AUDIT UNEXPECTED", name, e.message);
    }
  };
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
  for (const part of (ctx.source ?? "").split("--> statement-breakpoint"))
    if (part.trim()) await db.exec(part);
  assert.deepEqual(
    await snapshot(),
    before,
    "booking lifecycle migration must not change any existing business row",
  );
  console.log(
    "PASS booking lifecycle migration preserves every existing business row",
  );
  if (
    !(await db.query("SELECT to_regclass('auth.sessions') present")).rows[0]
      .present
  ) {
    await db.exec(
      "CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL)",
    );
  }
  const make = async (capacity = 5) =>
    (
      await db.query(
        "INSERT INTO programs(organization_id,title,status,duration_minutes,booking_duration_minutes,max_capacity) VALUES($1,'Transition audit','ACTIVE',60,ARRAY[60],$2) RETURNING program_id",
        [orgA, capacity],
      )
    ).rows[0].program_id;
  const time = async (day, hour = 10) =>
    (
      await db.query(
        "SELECT ((((now() AT TIME ZONE 'Asia/Seoul')::date+$1::int)::timestamp)+make_interval(hours=>$2::int)) AT TIME ZONE 'Asia/Seoul' t",
        [day, hour],
      )
    ).rows[0].t;
  const seed = async (p, days = [3, 10, 17], student = studentA) => {
    const rows = [];
    for (const day of days) {
      const t = await time(day);
      rows.push({
        start_time: new Date(t).toISOString(),
        end_time: new Date(+new Date(t) + 3600000).toISOString(),
      });
    }
    await asRole("authenticated", adminA);
    await db.query(
      "SELECT create_admin_schedule_series($1,$2,$3,$4::jsonb,$5)",
      [
        orgA,
        student,
        p,
        JSON.stringify(rows),
        days.length > 1 ? "FREQ=WEEKLY" : null,
      ],
    );
    return (
      await db.query(
        "SELECT * FROM schedules WHERE program_id=$1 ORDER BY start_time,schedule_id",
        [p],
      )
    ).rows;
  };
  const all = async (p) =>
    (
      await db.query(
        "SELECT * FROM schedules WHERE program_id=$1 ORDER BY schedule_id",
        [p],
      )
    ).rows;
  const impact = async (state, student = studentA) =>
    (
      await db.query(
        "SELECT get_student_change_impact($1,$2,$3,(SELECT class_end_date FROM profiles WHERE profile_id=$2)) i",
        [orgA, student, state],
      )
    ).rows[0].i;
  const change = async (state, token, student = studentA) =>
    db.query("SELECT set_student_state($1,$2,$3,$4)", [
      orgA,
      student,
      state,
      token,
    ]);
  const member = async (student = studentA) =>
    (
      await db.query(
        "SELECT state FROM organization_members WHERE organization_id=$1 AND profile_id=$2",
        [orgA, student],
      )
    ).rows[0].state;
  const notifications = async (rows) => {
    await asRole("postgres");
    const ids = [];
    for (const s of rows)
      ids.push(
        (
          await db.query(
            "INSERT INTO notifications(organization_id,type,recipient_phone,recipient_email,recipient_profile_id,schedule_id,alimtalk_status,email_status,reminder_generated) VALUES($1,'ALIMTALK','01000000000','audit@example.test',$2,$3,'PENDING','PENDING',true) RETURNING notification_id",
            [orgA, s.student_id, s.schedule_id],
          )
        ).rows[0].notification_id,
      );
    return ids;
  };
  const freshStudent = async () => {
    const t = (
      await db.query(
        "SELECT ceil(extract(epoch FROM clock_timestamp()))::bigint t",
      )
    ).rows[0].t;
    await asRole("authenticated", studentA, { iat: Number(t) });
  };
  const call = async (fn) => {
    await db.exec("SAVEPOINT audit_route");
    try {
      const r = await fn();
      if (r?.init?.status >= 400)
        await db.exec("ROLLBACK TO SAVEPOINT audit_route");
      await db.exec("RELEASE SAVEPOINT audit_route");
      return r;
    } catch (e) {
      await db.exec(
        "ROLLBACK TO SAVEPOINT audit_route; RELEASE SAVEPOINT audit_route",
      );
      throw e;
    }
  };
  const move = async (p, rows, student = studentA) =>
    db.query("SELECT update_admin_schedule_batch($1,$2,$3,$4::jsonb)", [
      orgA,
      student,
      p,
      JSON.stringify(
        rows.map((s) => ({
          schedule_id: s.schedule_id,
          start_time: new Date(+new Date(s.start_time) + 3600000).toISOString(),
          end_time: new Date(+new Date(s.end_time) + 3600000).toISOString(),
        })),
      ),
    ]);

  // Every sequence below runs only after migrations 0036, 0037 and 0038.
  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const state of ["GRADUATE", "DELETED"])
      for (const pastRoot of [false, true]) {
        await run(
          `lifecycle ${status} ${state} ${pastRoot ? "past-root" : "future-root"}`,
          "lifecycle",
          [],
          async () => {
            const p = await make(),
              rows = await seed(p, pastRoot ? [-14, 7, 14] : [3, 10, 17]);
            const pending = rows.filter(
              (s) => new Date(s.start_time) > new Date(),
            );
            const nids = await notifications(pending);
            await db.query(
              "INSERT INTO auth.sessions(id,user_id) SELECT gen_random_uuid(),auth_user_id FROM profiles WHERE profile_id=$1",
              [studentA],
            );
            await db.query(
              "INSERT INTO student_invites(organization_id,profile_id,token_hash,expires_at,created_by_profile_id) VALUES($1,$2,'transition-invite',now()+interval '1 day',$3)",
              [orgA, studentA, adminA],
            );
            await asRole("authenticated", adminA);
            await db.query(
              "UPDATE programs SET status=$2 WHERE program_id=$1",
              [p, status],
            );
            const original = await all(p),
              i = await impact(state);
            assert.equal(Number(i.cancel_count), pending.length);
            assert.equal(i.in_progress, false);
            await blocked(
              "SELECT set_student_state($1,$2,$3,NULL)",
              [orgA, studentA, state],
              /student_change_confirmation_required/,
            );
            const stateResponse = await call(() =>
              bridge(db, orgA, adminA).adminState(studentA, state, i.token),
            );
            assert.equal(stateResponse.url, "/admin/students");
            assert.equal(await member(), state);
            const left = await all(p);
            assert.deepEqual(
              left,
              original.filter((s) => new Date(s.end_time) <= new Date()),
            );
            await asRole("postgres");
            const ns = (
              await db.query(
                "SELECT *,can_deliver_student_notification(notification_id) allowed FROM notifications WHERE notification_id=ANY($1::bigint[])",
                [nids],
              )
            ).rows;
            assert.equal(ns.length, nids.length);
            assert.ok(
              ns.every(
                (n) =>
                  n.email_status === "SKIPPED" &&
                  n.alimtalk_status === "FAILED" &&
                  n.delivery_cancelled_at &&
                  !n.allowed,
              ),
            );
            assert.ok(
              (
                await db.query(
                  "SELECT revoked_at FROM student_invites WHERE token_hash='transition-invite'",
                )
              ).rows[0].revoked_at,
            );
            assert.equal(
              (
                await db.query(
                  "SELECT * FROM auth.sessions WHERE user_id=(SELECT auth_user_id FROM profiles WHERE profile_id=$1)",
                  [studentA],
                )
              ).rows.length,
              state === "DELETED" ? 0 : 1,
            );
            await asRole("authenticated", studentA);
            assert.equal(
              (await db.query("SELECT is_account_access_allowed() allowed"))
                .rows[0].allowed,
              state !== "DELETED",
            );
            assert.equal(
              (await all(p)).length,
              state === "DELETED" ? 0 : left.length,
            );
            const cancelRetry = await call(() =>
              bridge(db, orgA, studentA).studentDelete(pending[0].schedule_id),
            );
            assert.equal(
              cancelRetry.init.status,
              state === "DELETED" ? 403 : 404,
            );
            await blocked(
              "SELECT book_student_schedule($1,$2,now()+interval '2 days',now()+interval '2 days 1 hour')",
              [orgA, p],
              /schedule_not_authorized/,
            );
            await asRole("authenticated", adminA);
            assert.equal(
              (
                await call(() =>
                  bridge(db, orgA, adminA).adminRestore(studentA),
                )
              ).url,
              `/admin/students/${studentA}`,
            );
            assert.equal(await member(), "NORMAL");
            await asRole("postgres");
            await freshStudent();
            assert.equal((await all(p)).length, left.length);
            return {
              cancelled: pending.length,
              preserved: left.length,
              restoredReservations: 0,
              notificationDeliveryBlocked: true,
            };
          },
        );
      }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const state of ["GRADUATE", "DELETED"])
      for (const attendance of ["PENDING", "PRESENT", "ABSENT"]) {
        await run(
          `in-progress ${status} ${state} ${attendance}`,
          "in_progress",
          [],
          async () => {
            const p = await make();
            await asRole("authenticated", adminA);
            const ongoing = (
              await db.query(
                "INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) VALUES($1,$2,$3,now()-interval '30 minutes',now()+interval '30 minutes') RETURNING *",
                [orgA, studentA, p],
              )
            ).rows[0];
            const future = (await seed(p, [3])).find(
              (s) => s.schedule_id !== ongoing.schedule_id,
            );
            if (attendance !== "PENDING")
              await db.query("SELECT save_attendance($1,$2::jsonb)", [
                orgA,
                JSON.stringify([
                  {
                    schedule_id: ongoing.schedule_id,
                    version: 0,
                    status: attendance,
                  },
                ]),
              ]);
            await db.query(
              "UPDATE programs SET status=$2 WHERE program_id=$1",
              [p, status],
            );
            const i = await impact(state);
            assert.equal(i.in_progress, attendance !== "ABSENT");
            if (attendance === "ABSENT") {
              await change(state, i.token);
              assert.equal(await member(), state);
              assert.equal((await all(p)).length, 1);
              // Existing policy permits attendance corrections after leaving, including an ongoing absence.
              await db.query("SELECT save_attendance($1,$2::jsonb)", [
                orgA,
                JSON.stringify([
                  {
                    schedule_id: ongoing.schedule_id,
                    version: 1,
                    status: "PRESENT",
                  },
                ]),
              ]);
              assert.equal((await all(p))[0].attendance_status, "PRESENT");
              return {
                transitionAllowed: true,
                ongoingAbsenceRestoredAfterLeaving: true,
                policyQuestion: "ongoing-attendance-restore",
              };
            }
            await blocked(
              "SELECT set_student_state($1,$2,$3,$4)",
              [orgA, studentA, state, i.token],
              /student_lesson_in_progress/,
            );
            assert.equal(await member(), "NORMAL");
            assert.ok(
              (await all(p)).some((s) => s.schedule_id === future.schedule_id),
            );
            return { transitionBlocked: true, reservationsPreserved: true };
          },
        );
      }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const actor of ["student", "admin"])
      for (const position of [0, 1, 2]) {
        await run(
          `cancel-single ${status} ${actor} occurrence-${position + 1}`,
          "cancellation",
          position === 0 ? ["F1"] : [],
          async () => {
            const p = await make(),
              rows = await seed(p);
            await db.query(
              "UPDATE programs SET status=$2 WHERE program_id=$1",
              [p, status],
            );
            await asRole(
              "authenticated",
              actor === "student" ? studentA : adminA,
            );
            const route = bridge(
              db,
              orgA,
              actor === "student" ? studentA : adminA,
            );
            const r = await call(() =>
              actor === "student"
                ? route.studentDelete(rows[position].schedule_id)
                : route.adminDelete(rows[position].schedule_id),
            );
            assert.ok(r.url || r.body?.success, JSON.stringify(r));
            await asRole("authenticated", adminA);
            const left = await all(p);
            assert.equal(left.length, 2);
            assert.ok(
              !left.some((s) => s.schedule_id === rows[position].schedule_id),
            );
            if (status !== "ACTIVE")
              await db.query(
                "UPDATE programs SET status='ACTIVE' WHERE program_id=$1",
                [p],
              );
            await move(p, left);
            return { deleted: 1, remaining: 2, remainingEditable: true };
          },
        );
      }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const position of [0, 1, 2]) {
      await run(
        `cancel-future ${status} occurrence-${position + 1}`,
        "cancellation",
        position === 0 ? ["F1"] : [],
        async () => {
          const p = await make(),
            rows = await seed(p);
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          const r = await call(() =>
            bridge(db, orgA, adminA).adminDelete(
              rows[position].schedule_id,
              "future",
            ),
          );
          assert.equal(r.url, "/admin/schedules");
          const left = await all(p);
          assert.equal(left.length, position);
          return {
            requestedScope: "future",
            deleted: 3 - left.length,
            expectedDeleted: 3 - position,
            rootBulkDeleteMissing: false,
          };
        },
      );
    }

  for (const status of ["DRAFT", "ARCHIVED"])
    for (const recurring of [false, true]) {
      await run(
        `class-status ${status} ${recurring ? "series" : "single"}`,
        "class_status",
        [],
        async () => {
          const p = await make(),
            rows = await seed(p, recurring ? [3, 10, 17] : [3]);
          const nids = await notifications(rows);
          await asRole("authenticated", adminA);
          const before = await all(p);
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          assert.deepEqual(await all(p), before);
          await asRole("authenticated", studentA);
          assert.equal((await all(p)).length, rows.length);
          assert.equal(
            (await db.query("SELECT * FROM programs WHERE program_id=$1", [p]))
              .rows.length,
            1,
          );
          await blocked(
            "SELECT get_student_program_booking_availability($1,$2,(now() AT TIME ZONE 'Asia/Seoul')::date+1,60)",
            [orgA, p],
            /schedule_program_not_eligible/,
          );
          await asRole("authenticated", adminA);
          await blocked(
            "SELECT update_admin_schedule_batch($1,$2,$3,$4::jsonb)",
            [
              orgA,
              studentA,
              p,
              JSON.stringify([
                {
                  schedule_id: rows[0].schedule_id,
                  start_time: rows[0].start_time,
                  end_time: rows[0].end_time,
                },
              ]),
            ],
            /schedule_program_not_eligible/,
          );
          await asRole("postgres");
          const ns = (
            await db.query(
              "SELECT *,can_deliver_student_notification(notification_id) allowed FROM notifications WHERE notification_id=ANY($1::bigint[])",
              [nids],
            )
          ).rows;
          assert.ok(ns.every((n) => n.allowed && n.email_status === "PENDING"));
          await asRole("authenticated", adminA);
          await db.query(
            "UPDATE programs SET status='ACTIVE' WHERE program_id=$1",
            [p],
          );
          await move(p, rows);
          return {
            existingReservationsPreserved: true,
            existingRemindersContinue: true,
            newBookingBlocked: true,
            sameClassEditBlockedWhileInactive: true,
            reactivationEditable: true,
          };
        },
      );
    }

  for (const state of ["GRADUATE", "DELETED"]) {
    await run(
      `reassigned child then ${state} original student`,
      "mixed_student_series",
      ["F1", "N1"],
      async () => {
        const p = await make(),
          rows = await seed(p);
        const switched = await call(() =>
          bridge(db, orgA, adminA).adminUpdate(rows[1], {
            student_id: managedStudent,
            start_time: "10:00",
          }),
        );
        assert.equal(switched.url, "/admin/schedules");
        const changed = (await all(p)).find(
          (s) => s.schedule_id === rows[1].schedule_id,
        );
        assert.equal(changed.student_id, managedStudent);
        assert.equal(changed.parent_schedule_id, null);
        assert.equal(changed.rrule, null);
        const i = await impact(state);
        assert.equal(Number(i.cancel_count), 2);
        await change(state, i.token);
        const left = await all(p);
        assert.equal(left.length, 1);
        assert.equal(left[0].student_id, managedStudent);
        await move(p, left, managedStudent);
        return {
          otherStudentReservationPreserved: true,
          otherStudentReservationNowUneditable: false,
        };
      },
    );
  }
  await run(
    "reassigned last child survives original student future-series deletion",
    "mixed_student_series",
    ["N1"],
    async () => {
      const p = await make(),
        rows = await seed(p);
      assert.equal(
        (
          await call(() =>
            bridge(db, orgA, adminA).adminUpdate(rows[2], {
              student_id: managedStudent,
              start_time: "10:00",
            }),
          )
        ).url,
        "/admin/schedules",
      );
      const before = await all(p);
      assert.ok(before.some((s) => s.student_id === managedStudent));
      assert.equal(
        (
          await call(() =>
            bridge(db, orgA, adminA).adminDelete(rows[1].schedule_id, "future"),
          )
        ).url,
        "/admin/schedules",
      );
      assert.ok((await all(p)).some((s) => s.student_id === managedStudent));
      return { otherStudentReservationDeleted: false };
    },
  );

  for (const state of ["GRADUATE", "DELETED"])
    for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"]) {
      await run(
        `attendance-history ${status} ${state}`,
        "attendance_history",
        [],
        async () => {
          const p = await make(),
            rows = await seed(p, [-14, -7]);
          await db.query("SELECT save_attendance($1,$2::jsonb)", [
            orgA,
            JSON.stringify(
              rows.map((s, i) => ({
                schedule_id: s.schedule_id,
                version: 0,
                status: i ? "ABSENT" : "PRESENT",
              })),
            ),
          ]);
          const eventsBefore = (
            await db.query(
              "SELECT * FROM attendance_events WHERE schedule_id=ANY($1::bigint[]) ORDER BY event_id",
              [rows.map((s) => s.schedule_id)],
            )
          ).rows;
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          await change(state, (await impact(state)).token);
          assert.equal((await all(p)).length, 2);
          await db.query("SELECT save_attendance($1,$2::jsonb)", [
            orgA,
            JSON.stringify([
              {
                schedule_id: rows[1].schedule_id,
                version: 1,
                status: "PRESENT",
              },
            ]),
          ]);
          const eventsAfter = (
            await db.query(
              "SELECT * FROM attendance_events WHERE schedule_id=ANY($1::bigint[]) ORDER BY event_id",
              [rows.map((s) => s.schedule_id)],
            )
          ).rows;
          assert.deepEqual(eventsAfter.slice(0, 2), eventsBefore);
          assert.equal(eventsAfter.length, 3);
          return { historyPreserved: true, correctionAvailable: true };
        },
      );
    }

  // Turn on actual notification templates inside rolled-back fixtures.
  for (const actor of ["student", "admin"])
    for (const position of [0, 1, 2]) {
      await run(
        `cancel-notification ${actor} occurrence-${position + 1}`,
        "notifications",
        position === 0 ? [] : ["N2"],
        async () => {
          const p = await make(),
            rows = await seed(p);
          await asRole("postgres");
          await db.query(
            "UPDATE profiles SET phone='01000000000',contact_email='audit@example.test' WHERE profile_id=ANY($1::uuid[])",
            [[studentA, adminA]],
          );
          await db.query(
            "UPDATE auth.users SET email=id::text||'@booking-audit.invalid' WHERE id=ANY($1::uuid[])",
            [[studentA, adminA]],
          );
          const kind =
            actor === "student" ? "STD_CANCEL_ADMIN" : "ADM_CANCEL_STUDENT";
          await db.query(
            "UPDATE super_templates SET status='ACTIVE' WHERE type=$1",
            [kind],
          );
          await asRole(
            "authenticated",
            actor === "student" ? studentA : adminA,
          );
          const r = await call(() =>
            actor === "student"
              ? bridge(db, orgA, studentA).studentDelete(
                  rows[position].schedule_id,
                )
              : bridge(db, orgA, adminA).adminDelete(
                  rows[position].schedule_id,
                ),
          );
          assert.ok(r.url || r.body?.success);
          await asRole("postgres");
          const ns = (
            await db.query(
              "SELECT * FROM notifications WHERE organization_id=$1 AND alimtalk_template_code IN (SELECT kakao_template_code FROM super_templates WHERE type=$2)",
              [orgA, kind],
            )
          ).rows;
          assert.equal(ns.length, 1);
          return {
            cancelNoticeCount: ns.length,
            templateEnabled: true,
            parentEarlyReturn: false,
          };
        },
      );
    }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const actor of ["student", "admin"])
      for (const position of [0, 1, 2]) {
        await run(
          `pending-reminder-after-cancel ${status} ${actor} occurrence-${position + 1}`,
          "notifications",
          ["F2"],
          async () => {
            const p = await make(),
              rows = await seed(p),
              ids = await notifications(rows);
            await asRole("authenticated", adminA);
            await db.query(
              "UPDATE programs SET status=$2 WHERE program_id=$1",
              [p, status],
            );
            await asRole(
              "authenticated",
              actor === "student" ? studentA : adminA,
            );
            const r = await call(() =>
              actor === "student"
                ? bridge(db, orgA, studentA).studentDelete(
                    rows[position].schedule_id,
                  )
                : bridge(db, orgA, adminA).adminDelete(
                    rows[position].schedule_id,
                  ),
            );
            assert.ok(r.url || r.body?.success);
            await asRole("postgres");
            const stale = (
              await db.query(
                "SELECT *,can_deliver_student_notification(notification_id) allowed FROM notifications WHERE notification_id=$1",
                [ids[position]],
              )
            ).rows[0];
            assert.equal(stale.schedule_id, null);
            assert.equal(stale.email_status, "SKIPPED");
            assert.ok(stale.delivery_cancelled_at);
            assert.equal(stale.allowed, false);
            return { deletedReservationReminderStillDeliverable: false };
          },
        );
      }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const state of ["GRADUATE", "DELETED"]) {
      await run(
        `lifecycle-delete-failure-rollback ${status} ${state}`,
        "atomicity",
        [],
        async () => {
          const p = await make(),
            rows = await seed(p),
            ids = await notifications(rows);
          await asRole("postgres");
          await db.exec(
            "CREATE FUNCTION pg_temp.audit_fail_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_delete_failed'; END $$; CREATE TRIGGER audit_fail_delete BEFORE DELETE ON schedules FOR EACH ROW EXECUTE FUNCTION pg_temp.audit_fail_delete()",
          );
          await asRole("authenticated", adminA);
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          const i = await impact(state);
          await blocked(
            "SELECT set_student_state($1,$2,$3,$4)",
            [orgA, studentA, state, i.token],
            /audit_delete_failed/,
          );
          assert.equal(await member(), "NORMAL");
          assert.equal((await all(p)).length, 3);
          await asRole("postgres");
          const ns = (
            await db.query(
              "SELECT * FROM notifications WHERE notification_id=ANY($1::bigint[])",
              [ids],
            )
          ).rows;
          assert.ok(
            ns.every(
              (n) =>
                !n.delivery_cancelled_at &&
                n.email_status === "PENDING" &&
                n.alimtalk_status === "PENDING",
            ),
          );
          return {
            studentStateRolledBack: true,
            reservationsRolledBack: true,
            notificationsRolledBack: true,
          };
        },
      );
      await run(
        `stale-confirmation ${status} ${state}`,
        "confirmation",
        [],
        async () => {
          const p = await make(),
            q = await make();
          await seed(p);
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          const i = await impact(state);
          await seed(q, [4]);
          await blocked(
            "SELECT set_student_state($1,$2,$3,$4)",
            [orgA, studentA, state, i.token],
            /student_change_confirmation_required/,
          );
          assert.equal(await member(), "NORMAL");
          assert.equal((await all(p)).length, 3);
          assert.equal((await all(q)).length, 1);
          await change(state, (await impact(state)).token);
          assert.equal((await all(p)).length, 0);
          assert.equal((await all(q)).length, 0);
          return {
            staleTokenRejected: true,
            latestConfirmationCancelsAllClasses: true,
          };
        },
      );
    }

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"]) {
    await run(
      `course-shortening ${status} then extension and graduation`,
      "course_period",
      [],
      async () => {
        const p = await make(),
          rows = await seed(p),
          ids = await notifications(rows);
        await asRole("authenticated", adminA);
        await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
          p,
          status,
        ]);
        const end = (
          await db.query(
            "SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date+10)::text e",
          )
        ).rows[0].e;
        const i = (
          await db.query(
            "SELECT get_student_change_impact($1,$2,'NORMAL',$3::date) i",
            [orgA, studentA, end],
          )
        ).rows[0].i;
        assert.equal(Number(i.cancel_count), 1);
        const values = {
          name: "Student",
          phone: "01033334444",
          type: "STUDENT",
          state: "NORMAL",
          class_end_date: end,
          lifecycle_confirmation: i.token,
        };
        await db.query("SELECT save_managed_student($1,$2::jsonb,$3)", [
          orgA,
          JSON.stringify(values),
          studentA,
        ]);
        assert.equal((await all(p)).length, 2);
        await asRole("postgres");
        const ns = (
          await db.query(
            "SELECT * FROM notifications WHERE notification_id=ANY($1::bigint[]) ORDER BY notification_id",
            [ids],
          )
        ).rows;
        assert.equal(ns[0].email_status, "PENDING");
        assert.equal(ns[1].email_status, "PENDING");
        assert.equal(ns[2].email_status, "SKIPPED");
        await asRole("authenticated", adminA);
        await db.query(
          "UPDATE profiles SET class_end_date=(now() AT TIME ZONE 'Asia/Seoul')::date+30 WHERE profile_id=$1",
          [studentA],
        );
        assert.equal((await all(p)).length, 2);
        await change("GRADUATE", (await impact("GRADUATE")).token);
        assert.equal((await all(p)).length, 0);
        return {
          endDateInclusive: true,
          onlyOutOfRangeFutureCancelled: true,
          extensionDoesNotRestore: true,
          laterGraduationCancelsRemainder: true,
        };
      },
    );
  }

  for (const reason of [
    "student_conflict",
    "capacity",
    "outside_course",
    "duration",
  ]) {
    await run(`repeat-create-atomic ${reason}`, "atomicity", [], async () => {
      const p = await make(reason === "capacity" ? 1 : 5);
      if (reason === "student_conflict") {
        const q = await make();
        await seed(q, [10]);
      }
      if (reason === "capacity") await seed(p, [10], managedStudent);
      if (reason === "outside_course")
        await db.query(
          "UPDATE profiles SET class_end_date=(now() AT TIME ZONE 'Asia/Seoul')::date+10 WHERE profile_id=$1",
          [studentA],
        );
      const rows = [];
      for (const [i, day] of [3, 10, 17].entries()) {
        const t = new Date(await time(day));
        rows.push({
          start_time: t.toISOString(),
          end_time: new Date(
            +t + (reason === "duration" && i === 1 ? 120 : 60) * 60000,
          ).toISOString(),
        });
      }
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT create_admin_schedule_series($1,$2,$3,$4::jsonb,$5)",
        [orgA, studentA, p, JSON.stringify(rows), "FREQ=WEEKLY"],
        new RegExp(
          {
            student_conflict: "schedule_student_conflict",
            capacity: "schedule_capacity_exceeded",
            outside_course: "schedule_outside_course",
            duration: "schedule_time_not_allowed",
          }[reason],
        ),
      );
      assert.equal(
        (await all(p)).filter((s) => s.student_id === studentA).length,
        0,
      );
      return { wholeSeriesRolledBack: true };
    });
  }
  await run(
    "repeat-move-atomic later occurrence outside course",
    "atomicity",
    [],
    async () => {
      const p = await make(),
        rows = await seed(p);
      await db.query(
        "UPDATE profiles SET class_end_date=(now() AT TIME ZONE 'Asia/Seoul')::date+17 WHERE profile_id=$1",
        [studentA],
      );
      const before = await all(p),
        shifted = rows.map((s) => ({
          schedule_id: s.schedule_id,
          start_time: new Date(
            +new Date(s.start_time) + 7 * 86400000,
          ).toISOString(),
          end_time: new Date(
            +new Date(s.end_time) + 7 * 86400000,
          ).toISOString(),
        }));
      await blocked(
        "SELECT update_admin_schedule_batch($1,$2,$3,$4::jsonb)",
        [orgA, studentA, p, JSON.stringify(shifted)],
        /schedule_outside_course/,
      );
      assert.deepEqual(await all(p), before);
      return { wholeMoveRolledBack: true };
    },
  );
  await run(
    "repeat-move route preserves sequence and cancellation snapshots",
    "recurring_update",
    [],
    async () => {
      const p = await make(),
        rows = await seed(p);
      const target = new Date(+new Date(rows[1].start_time) + 86400000);
      const date = target.toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      });
      const r = await call(() =>
        bridge(db, orgA, adminA).adminUpdate(rows[1], {
          date,
          start_time: "10:00",
          update_scope: "future",
        }),
      );
      assert.equal(r.url, "/admin/schedules");
      const after = await all(p);
      assert.equal(
        +new Date(after[0].start_time),
        +new Date(rows[0].start_time),
      );
      for (const s of after.slice(1)) {
        const old = rows.find((x) => x.schedule_id === s.schedule_id);
        assert.equal(
          +new Date(s.start_time) - +new Date(old.start_time),
          86400000,
        );
        assert.deepEqual(s.cancellation_policy, old.cancellation_policy);
      }
      return {
        firstOccurrenceUnchanged: true,
        futureOccurrencesShifted: true,
        cancellationPolicyPreserved: true,
      };
    },
  );

  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const state of ["GRADUATE", "DELETED"]) {
      await run(
        `single-reservation ${status} ${state} then restore`,
        "lifecycle",
        [],
        async () => {
          const p = await make(),
            rows = await seed(p, [3]),
            ids = await notifications(rows);
          await asRole("authenticated", adminA);
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          const i = await impact(state);
          assert.equal(Number(i.cancel_count), 1);
          assert.equal(
            (
              await call(() =>
                bridge(db, orgA, adminA).adminState(studentA, state, i.token),
              )
            ).url,
            "/admin/students",
          );
          assert.equal((await all(p)).length, 0);
          assert.equal(
            (await call(() => bridge(db, orgA, adminA).adminRestore(studentA)))
              .url,
            `/admin/students/${studentA}`,
          );
          assert.equal((await all(p)).length, 0);
          await asRole("postgres");
          const n = (
            await db.query(
              "SELECT *,can_deliver_student_notification(notification_id) allowed FROM notifications WHERE notification_id=$1",
              [ids[0]],
            )
          ).rows[0];
          assert.equal(n.allowed, false);
          assert.equal(n.email_status, "SKIPPED");
          return {
            singleCancelled: true,
            restoreDoesNotResurrectReservationOrReminder: true,
          };
        },
      );
    }
  for (const status of ["ACTIVE", "DRAFT", "ARCHIVED"])
    for (const mode of ["previous_day", "hours_zero", "hours_closed"]) {
      await run(
        `saved-cancellation-policy ${status} ${mode}`,
        "cancellation_policy",
        [],
        async () => {
          const p = await make();
          const saved =
            mode === "previous_day"
              ? { mode: "previous_day" }
              : {
                  mode: "hours_before",
                  hours: mode === "hours_zero" ? 0 : 720,
                };
          await db.query(
            "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES($1,'cancellation_policy',$2::jsonb) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
            [orgA, JSON.stringify(saved)],
          );
          const rows = await seed(p, [3]);
          assert.deepEqual(rows[0].cancellation_policy, saved);
          await db.query(
            "UPDATE settings SET setting_value=$2::jsonb WHERE organization_id=$1 AND setting_key='cancellation_policy'",
            [
              orgA,
              JSON.stringify({
                mode: "hours_before",
                hours: mode === "hours_closed" ? 0 : 720,
              }),
            ],
          );
          await db.query("UPDATE programs SET status=$2 WHERE program_id=$1", [
            p,
            status,
          ]);
          await asRole("authenticated", studentA);
          const r = await call(() =>
            bridge(db, orgA, studentA).studentDelete(rows[0].schedule_id),
          );
          if (mode === "hours_closed") {
            assert.equal(r.init.status, 400);
            assert.equal((await all(p)).length, 1);
            await asRole("authenticated", adminA);
            assert.equal(
              (
                await call(() =>
                  bridge(db, orgA, adminA).adminDelete(rows[0].schedule_id),
                )
              ).url,
              "/admin/schedules",
            );
          } else assert.equal(r.body.success, true);
          await asRole("authenticated", adminA);
          assert.equal((await all(p)).length, 0);
          return {
            savedPolicyUsed: true,
            latestSettingDoesNotRewriteExistingReservation: true,
            adminCanCancelAfterStudentDeadline: true,
          };
        },
      );
    }

  await run(
    "admin RPC and direct writes reject past-date moves without changing reservations",
    "date_integrity",
    [],
    async () => {
      const p = await make(),
        rows = await seed(p, [3]),
        before = await all(p);
      const start = new Date(await time(-1)),
        end = new Date(+start + 3600000);
      await blocked(
        "SELECT update_admin_schedule_batch($1,$2,$3,$4::jsonb)",
        [
          orgA,
          studentA,
          p,
          JSON.stringify([
            {
              schedule_id: rows[0].schedule_id,
              start_time: start.toISOString(),
              end_time: end.toISOString(),
            },
          ]),
        ],
        /schedule_date_not_allowed/,
      );
      await blocked(
        "UPDATE schedules SET start_time=$2,end_time=$3 WHERE schedule_id=$1",
        [rows[0].schedule_id, start.toISOString(), end.toISOString()],
        /schedule_date_not_allowed/,
      );
      assert.deepEqual(await all(p), before);
    },
  );
  await run(
    "schedule movement cancels old pending snapshots and creates a fresh booking notice",
    "notifications",
    [],
    async () => {
      const p = await make(),
        rows = await seed(p, [3]),
        ids = await notifications(rows);
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET phone='01000000000',contact_email='audit@example.test' WHERE profile_id=$1",
        [studentA],
      );
      await db.query(
        "UPDATE super_templates SET status='ACTIVE' WHERE type='ADM_BOOK_STUDENT'",
      );
      const code = (
        await db.query(
          "SELECT kakao_template_code FROM super_templates WHERE type='ADM_BOOK_STUDENT'",
        )
      ).rows[0].kakao_template_code;
      const old = (
        await db.query(
          "INSERT INTO notifications(organization_id,type,recipient_phone,recipient_profile_id,schedule_id,alimtalk_status,email_status,alimtalk_template_code,alimtalk_variables) VALUES($1,'ALIMTALK','01000000000',$2,$3,'PENDING','PENDING',$4,'{\"schedule_datetime\":\"OLD\"}') RETURNING notification_id",
          [orgA, studentA, rows[0].schedule_id, code],
        )
      ).rows[0].notification_id;
      await asRole("authenticated", adminA);
      await move(p, rows);
      await asRole("postgres");
      const oldNotices = (
        await db.query(
          "SELECT *,can_deliver_student_notification(notification_id) allowed FROM notifications WHERE notification_id=ANY($1::bigint[])",
          [[ids[0], old]],
        )
      ).rows;
      assert.ok(
        oldNotices.every(
          (n) =>
            n.delivery_cancelled_at &&
            n.email_status === "SKIPPED" &&
            !n.allowed,
        ),
      );
      const fresh = (
        await db.query(
          "SELECT * FROM notifications WHERE schedule_id=$1 AND alimtalk_template_code=$2 AND delivery_cancelled_at IS NULL",
          [rows[0].schedule_id, code],
        )
      ).rows;
      assert.equal(fresh.length, 1);
      assert.notEqual(fresh[0].alimtalk_variables.schedule_datetime, "OLD");
      assert.equal(
        (
          await db.query(
            "SELECT * FROM notifications WHERE schedule_id=$1 AND reminder_generated=true AND delivery_cancelled_at IS NULL",
            [rows[0].schedule_id],
          )
        ).rows.length,
        0,
      );
    },
  );

  const summary = {
    total: results.length,
    verified: results.filter((r) => r.status === "verified").length,
    policyReview: results.filter((r) => r.status === "policy_review").length,
    unexpectedFailures: results.filter((r) => r.status === "unexpected_failure")
      .length,
  };
  console.log("BOOKING LIFECYCLE REGRESSION", JSON.stringify(summary));
  assert.equal(
    summary.unexpectedFailures,
    0,
    JSON.stringify(results.filter((r) => r.status === "unexpected_failure")),
  );
}
