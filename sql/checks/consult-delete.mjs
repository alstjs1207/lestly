import assert from "node:assert/strict";

export async function checkConsultDeletion({
  db,
  check,
  asRole,
  blocked,
  pushStore,
  consultStore,
  orgA,
  orgB,
  adminA,
  adminB,
  studentA,
  source,
}) {
  const snapshot = async () =>
    Promise.all(
      (
        await db.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map(
        async ({ tablename }) =>
          (
            await db.query(
              `SELECT to_jsonb(t) FROM public."${tablename}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows,
      ),
    );
  await check(
    "consult delete migration preserves all existing public rows and keeps request tombstones server-only",
    async () => {
      const before = await snapshot();
      await db.exec(source);
      assert.deepEqual(await snapshot(), before);
      await asRole("anon");
      await blocked(
        "SELECT * FROM consult_submission_keys",
        [],
        /permission denied/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        "SELECT * FROM consult_submission_keys",
        [],
        /permission denied/,
      );
    },
  );
  await db.exec(source);
  const hash = "d".repeat(64),
    phoneHash = "e".repeat(64),
    request = "60000000-0000-4000-8000-000000004601";
  async function seed() {
    await asRole("postgres");
    await db.exec(
      "UPDATE programs SET is_public=true,slug='delete-consult-fixture',status='ACTIVE' WHERE program_id=1",
    );
    await pushStore.savePushSubscription(
      orgA,
      adminA,
      "70000000-0000-4000-8000-000000004601",
      {
        endpoint: "https://web.push.apple.com/delete-consult",
        keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
      },
    );
    const id = (
      await db.query(
        "SELECT submit_public_consultation(1,'Delete fixture','01012345678','fixture',$1,$2,$3) id",
        [request, hash, phoneHash],
      )
    ).rows[0].id;
    const foreign = (
      await db.query(
        "INSERT INTO notifications(organization_id,type,recipient_name,recipient_phone) VALUES($1,'CONSULT_REQUEST','Foreign fixture','01012345678') RETURNING notification_id",
        [orgB],
      )
    ).rows[0].notification_id;
    const other = (
      await db.query(
        "INSERT INTO notifications(organization_id,type,recipient_phone,alimtalk_status) VALUES($1,'ALIMTALK','01012345678','SENT') RETURNING notification_id",
        [orgA],
      )
    ).rows[0].notification_id;
    return { id, foreign, other };
  }
  await check(
    "only a normal own-organization admin can delete consultations; students, outsiders and non-consultation records are protected",
    async () => {
      const { id, other } = await seed();
      await asRole("anon");
      await blocked(
        "DELETE FROM notifications WHERE notification_id=$1",
        [id],
        /permission denied/,
      );
      for (const actor of [studentA, adminB]) {
        await asRole("authenticated", actor);
        assert.equal(
          (
            await db.query(
              "DELETE FROM notifications WHERE notification_id=$1 RETURNING notification_id",
              [id],
            )
          ).rows.length,
          0,
        );
      }
      await asRole("authenticated", adminA);
      assert.equal(
        (
          await db.query(
            "DELETE FROM notifications WHERE notification_id=$1 RETURNING notification_id",
            [other],
          )
        ).rows.length,
        0,
      );
      await asRole("postgres");
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, adminA],
      );
      await asRole("authenticated", adminA);
      assert.equal(
        (
          await db.query(
            "DELETE FROM notifications WHERE notification_id=$1 RETURNING notification_id",
            [id],
          )
        ).rows.length,
        0,
      );
    },
  );
  await check(
    "consult deletion cascades only its bell and push records while preserving other histories and preventing request replay",
    async () => {
      const { id, foreign, other } = await seed();
      const target = (
        await db.query(
          "SELECT * FROM consult_submission_keys WHERE request_id=$1",
          [request],
        )
      ).rows[0];
      const events = (
        await db.query(
          "SELECT event_id FROM push_events WHERE notification_id=$1",
          [id],
        )
      ).rows.map((r) => r.event_id);
      assert.ok(events.length > 0);
      assert.ok(
        (
          await db.query(
            "SELECT 1 FROM push_deliveries WHERE event_id=ANY($1::uuid[])",
            [events],
          )
        ).rows.length > 0,
      );
      await asRole("authenticated", adminA);
      assert.equal(
        (
          await db.query(
            "DELETE FROM notifications WHERE notification_id=$1 RETURNING notification_id",
            [id],
          )
        ).rows.length,
        1,
      );
      await asRole("postgres");
      for (const table of [
        "notifications",
        "in_app_notifications",
        "push_events",
      ]) {
        assert.equal(
          (
            await db.query(
              `SELECT count(*)::int n FROM ${table} WHERE notification_id=$1`,
              [id],
            )
          ).rows[0].n,
          0,
        );
      }
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM push_deliveries WHERE event_id=ANY($1::uuid[])",
            [events],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM notifications WHERE notification_id=ANY($1::bigint[])",
            [[foreign, other]],
          )
        ).rows[0].n,
        2,
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM push_subscriptions"))
          .rows[0].n,
        1,
      );
      const tombstone = (
        await db.query(
          "SELECT * FROM consult_submission_keys WHERE request_id=$1",
          [request],
        )
      ).rows[0];
      assert.equal(tombstone.notification_id, null);
      assert.equal(tombstone.payload_hash, target.payload_hash);
      assert.deepEqual(tombstone.expires_at, target.expires_at);
      assert.equal(
        await consultStore.findAcceptedConsultation(request, hash),
        true,
      );
      assert.equal(
        await consultStore.findAcceptedConsultation(request, "f".repeat(64)),
        false,
      );
      assert.equal(
        (
          await db.query(
            "SELECT submit_public_consultation(1,'Delete fixture','01012345678','fixture',$1,$2,$3) id",
            [request, hash, phoneHash],
          )
        ).rows[0].id,
        null,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM notifications WHERE notification_id=$1",
            [id],
          )
        ).rows[0].n,
        0,
      );
      await blocked(
        "SELECT submit_public_consultation(1,'Changed','01012345678','fixture',$1,$2,$3)",
        [request, "f".repeat(64), phoneHash],
        /consult_request_conflict/,
      );
    },
  );
}
