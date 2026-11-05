import assert from "node:assert/strict";

export async function installConsultSecurity({ db, check, source, orgA }) {
  await check(
    "consult migration preserves every existing public row including historical consultation status and notes",
    async () => {
      await db.query(
        "INSERT INTO notifications(organization_id,type,recipient_name,recipient_phone,consult_status,consult_result,consult_notes,consult_message) VALUES($1,'CONSULT_REQUEST','Legacy','01012345678','COMPLETED','SUCCESS','old note','old message')",
        [orgA],
      );
      const tables = (
        await db.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows;
      const snapshot = async () =>
        Promise.all(
          tables.map(
            async ({ tablename }) =>
              (
                await db.query(
                  `SELECT to_jsonb(t) row FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`,
                )
              ).rows,
          ),
        );
      const before = await snapshot();
      await db.exec(source);
      assert.deepEqual(await snapshot(), before);
    },
  );
  await db.exec(source);
}

export async function checkConsultSecurity({
  db,
  check,
  asRole,
  blocked,
  pushStore,
  orgA,
  orgB,
  adminA,
  adminB,
  studentA,
}) {
  const hash = "a".repeat(64),
    phoneHash = "b".repeat(64);
  let requestNo = 0;
  const requestId = () =>
    `60000000-0000-4000-8000-${String(++requestNo).padStart(12, "0")}`;
  const submit = async ({
    program = 1,
    request = requestId(),
    payload = hash,
    phone = phoneHash,
  } = {}) =>
    (
      await db.query(
        "SELECT submit_public_consultation($1,'Test','01012345678','message',$2,$3,$4) id",
        [program, request, payload, phone],
      )
    ).rows[0].id;
  async function seed() {
    await asRole("postgres");
    await db.exec(
      "UPDATE programs SET is_public=true,slug='consult-public' WHERE program_id=1",
    );
    await pushStore.savePushSubscription(
      orgA,
      adminA,
      "70000000-0000-4000-8000-000000000001",
      {
        endpoint: "https://web.push.apple.com/consult",
        keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
      },
    );
    await pushStore.savePushSubscription(
      orgB,
      adminB,
      "70000000-0000-4000-8000-000000000002",
      {
        endpoint: "https://web.push.apple.com/foreign-consult",
        keys: { p256dh: "C".repeat(87), auth: "D".repeat(22) },
      },
    );
  }
  await check(
    "consult functions, deduplication keys and rate buckets deny anonymous and authenticated direct access",
    async () => {
      for (const [role, id] of [
        ["anon", ""],
        ["authenticated", studentA],
        ["authenticated", adminA],
      ]) {
        await asRole(role, id);
        await blocked(
          "SELECT consume_consult_limit('forged',999,600)",
          [],
          /permission denied/,
        );
        await blocked(
          "SELECT * FROM consult_submission_keys",
          [],
          /permission denied/,
        );
        await blocked(
          "SELECT submit_public_consultation(1,'x','01012345678','',gen_random_uuid(),$1,$1)",
          [hash],
          /permission denied/,
        );
        await blocked(
          "INSERT INTO notifications(organization_id,type,recipient_phone) VALUES($1,'CONSULT_REQUEST','01012345678')",
          [orgA],
          /permission denied|row-level security/,
        );
      }
    },
  );
  await check(
    "consult stores once with atomic bell/outbox, no account or paid message, and no cross-tenant fanout",
    async () => {
      await seed();
      const profiles = (await db.query("SELECT count(*) count FROM profiles"))
        .rows;
      const key = requestId();
      const id = await submit({ request: key });
      assert.equal(await submit({ request: key }), id);
      const notices = (await db.query("SELECT * FROM notifications")).rows;
      assert.equal(notices.length, 1);
      assert.equal(notices[0].type, "CONSULT_REQUEST");
      assert.equal(notices[0].alimtalk_status, null);
      assert.equal(notices[0].email_status, null);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM in_app_notifications WHERE notification_id=$1",
            [id],
          )
        ).rows.length,
        1,
      );
      const events = (
        await db.query("SELECT * FROM push_events WHERE notification_id=$1", [
          id,
        ])
      ).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].recipient_profile_id, adminA);
      assert.equal(events[0].body.includes("010"), false);
      assert.equal(events[0].body.includes("message"), false);
      assert.deepEqual(
        (await db.query("SELECT status FROM push_deliveries")).rows,
        [{ status: "CONSULT_PENDING" }],
      );
      assert.deepEqual(
        (await db.query("SELECT count(*) count FROM profiles")).rows,
        profiles,
      );
      await blocked(
        "SELECT submit_public_consultation(1,'Changed','01012345678','',$1,$2,$3)",
        [key, "c".repeat(64), phoneHash],
        /consult_request_conflict/,
      );
    },
  );
  await check(
    "consult treats SQL/script-shaped names and messages as data and preserves existing profiles",
    async () => {
      await seed();
      const before = (
        await db.query(
          "SELECT to_jsonb(p) row FROM profiles p ORDER BY profile_id",
        )
      ).rows;
      const payload =
        "'; DELETE FROM public.profiles; -- <script>alert(1)</script>";
      const id = (
        await db.query(
          "SELECT submit_public_consultation(1,$1,'01012345678',$1,gen_random_uuid(),$2,$3) id",
          [payload, hash, phoneHash],
        )
      ).rows[0].id;
      assert.deepEqual(
        (
          await db.query(
            "SELECT to_jsonb(p) row FROM profiles p ORDER BY profile_id",
          )
        ).rows,
        before,
      );
      const record = (
        await db.query(
          "SELECT recipient_name,consult_message FROM notifications WHERE notification_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(record.recipient_name, payload);
      assert.equal(record.consult_message, payload);
    },
  );
  await check(
    "consult rejects private, draft, archived or missing classes and database-invalid contacts",
    async () => {
      await seed();
      for (const status of ["DRAFT", "ARCHIVED"]) {
        await db.query("UPDATE programs SET status=$1 WHERE program_id=1", [
          status,
        ]);
        await blocked(
          "SELECT submit_public_consultation(1,'x','01012345678','',gen_random_uuid(),$1,$1)",
          [hash],
          /consult_program_unavailable/,
        );
      }
      await blocked(
        "SELECT submit_public_consultation(2,'x','01012345678','',gen_random_uuid(),$1,$1)",
        [hash],
        /consult_program_unavailable/,
      );
      await blocked(
        "SELECT submit_public_consultation(999999,'x','01012345678','',gen_random_uuid(),$1,$1)",
        [hash],
        /consult_program_unavailable/,
      );
      await blocked(
        "SELECT submit_public_consultation(1,'','bad','',gen_random_uuid(),$1,$1)",
        [hash],
        /consult_invalid_input/,
      );
    },
  );
  await check(
    "consult shared counters enforce IP and organization/phone budgets without extra records or fanout",
    async () => {
      await seed();
      for (let i = 0; i < 10; i++)
        assert.equal(
          (
            await db.query(
              "SELECT consume_consult_limit('ip:test',10,600) allowed",
            )
          ).rows[0].allowed,
          true,
        );
      assert.equal(
        (
          await db.query(
            "SELECT consume_consult_limit('ip:test',10,600) allowed",
          )
        ).rows[0].allowed,
        false,
      );
      for (let i = 0; i < 3; i++) assert.ok(await submit());
      assert.equal(await submit(), null);
      assert.equal(
        (await db.query("SELECT count(*) count FROM notifications")).rows[0]
          .count,
        3,
      );
      assert.equal(
        (await db.query("SELECT count(*) count FROM in_app_notifications"))
          .rows[0].count,
        3,
      );
      await db.exec("DELETE FROM consult_rate_limits");
      for (let i = 0; i < 100; i++)
        await db.query("SELECT consume_consult_limit($1,100,3600)", [
          "org:" + orgA,
        ]);
      assert.equal(await submit({ phone: "d".repeat(64) }), null);
    },
  );
  await check(
    "consult outbox failure rolls back the request, bell and idempotency record together",
    async () => {
      await seed();
      await db.exec(
        "CREATE FUNCTION public.reject_consult_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outbox_unavailable'; END $$; CREATE TRIGGER reject_consult_test BEFORE INSERT ON public.push_events FOR EACH ROW EXECUTE FUNCTION public.reject_consult_test()",
      );
      await blocked(
        "SELECT submit_public_consultation(1,'x','01012345678','',gen_random_uuid(),$1,$1)",
        [hash],
        /outbox_unavailable/,
      );
      for (const table of [
        "notifications",
        "in_app_notifications",
        "consult_submission_keys",
        "push_events",
        "push_deliveries",
      ])
        assert.equal(
          (await db.query(`SELECT count(*) count FROM ${table}`)).rows[0].count,
          0,
        );
    },
  );
  await check(
    "consult read/edit is tenant-only, original request fields are immutable, and completion can be reopened",
    async () => {
      await seed();
      const id = await submit();
      await asRole("authenticated", adminB);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM notifications WHERE notification_id=$1",
            [id],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE notifications SET consult_notes='foreign' WHERE notification_id=$1 RETURNING notification_id",
            [id],
          )
        ).rows.length,
        0,
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM notifications WHERE notification_id=$1",
            [id],
          )
        ).rows.length,
        0,
      );
      await asRole("authenticated", adminA);
      await blocked(
        "UPDATE notifications SET recipient_phone='01099999999' WHERE notification_id=$1",
        [id],
        /consult_immutable_fields/,
      );
      await blocked(
        "UPDATE notifications SET consult_notes=$2 WHERE notification_id=$1",
        [id, "x".repeat(5001)],
        /consult_notes_too_long/,
      );
      await db.query(
        "UPDATE notifications SET consult_status='COMPLETED',consult_notes='done' WHERE notification_id=$1",
        [id],
      );
      let row = (
        await db.query(
          "SELECT consult_completed_by,consult_completed_at FROM notifications WHERE notification_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(row.consult_completed_by, adminA);
      assert.ok(row.consult_completed_at);
      await db.query(
        "UPDATE notifications SET consult_status='WAITING' WHERE notification_id=$1",
        [id],
      );
      row = (
        await db.query(
          "SELECT consult_completed_by,consult_completed_at FROM notifications WHERE notification_id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(row.consult_completed_at, null);
      assert.equal(row.consult_completed_by, null);
    },
  );
  await check(
    "consult deliveries are immediate-only, isolated from all scheduled workers and recheck revoked admin access",
    async () => {
      await seed();
      const id = await submit();
      assert.equal(
        (
          await db.query(
            "SELECT * FROM push_deliveries WHERE status IN ('PENDING','SENDING')",
          )
        ).rows.length,
        0,
      );
      let claims = await pushStore.claimPushDeliveries({
        notificationId: Number(id),
      });
      assert.equal(claims.length, 1);
      assert.equal(
        (
          await pushStore.getPushDeliveryTarget(
            claims[0].delivery_id,
            claims[0].claim_token,
          )
        ).eligible,
        true,
      );
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      await pushStore.finishPushDelivery(claims[0], "PENDING", "push_http_503");
      assert.equal(
        (await db.query("SELECT status FROM push_deliveries")).rows[0].status,
        "FAILED",
      );
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      assert.equal(
        (await pushStore.claimPushDeliveries({ notificationId: Number(id) }))
          .length,
        0,
      );
      const secondId = await submit({ phone: "e".repeat(64) });
      claims = await pushStore.claimPushDeliveries({
        notificationId: Number(secondId),
      });
      await db.query(
        "UPDATE organization_members SET state='DELETED' WHERE profile_id=$1 AND organization_id=$2",
        [adminA, orgA],
      );
      assert.equal(
        (
          await pushStore.getPushDeliveryTarget(
            claims[0].delivery_id,
            claims[0].claim_token,
          )
        ).eligible,
        false,
      );
      await db.exec(
        "UPDATE push_deliveries SET locked_until=now()-interval '1 second' WHERE status='CONSULT_SENDING'",
      );
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      assert.equal(
        (
          await pushStore.claimPushDeliveries({
            notificationId: Number(secondId),
          })
        ).length,
        0,
      );
    },
  );
}
