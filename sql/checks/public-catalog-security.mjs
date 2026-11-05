import assert from "node:assert/strict";

export async function checkPublicCatalogSecurity({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  adminB,
  studentA,
  projection,
  lockdown,
}) {
  const snapshot = async () =>
    (
      await db.query(
        "SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY program_id) FROM programs p) programs,(SELECT jsonb_agg(to_jsonb(i) ORDER BY instructor_id) FROM instructors i) instructors,(SELECT jsonb_agg(to_jsonb(s) ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(to_jsonb(n) ORDER BY notification_id) FROM notifications n) notifications",
      )
    ).rows;
  await check(
    "public catalog migrations preserve existing class, instructor, booking and consultation rows",
    async () => {
      const before = await snapshot();
      await db.exec(projection);
      await db.exec(lockdown);
      assert.deepEqual(await snapshot(), before);
    },
  );
  await db.exec(projection);
  await db.exec(lockdown);
  const seed = async () => {
    await asRole("postgres");
    await db.query(
      "UPDATE instructors SET push_profile_id=$1,career='[\"지도 경력\"]',sns=$2::jsonb WHERE instructor_id=1",
      [
        adminA,
        JSON.stringify({
          instagram: "https://www.instagram.com/example",
          private_note: "must-not-leak",
        }),
      ],
    );
    await db.exec(
      'UPDATE programs SET slug=\'safe-public\',is_public=true,status=\'ACTIVE\',instructor_id=1,price=123456,curriculum=\'[{"session":1,"title":"기초","description":"준비물","private_note":"must-not-leak"}]\' WHERE program_id=1',
    );
  };
  await check(
    "anonymous direct table and column reads are denied, while public RPC returns only introduction fields",
    async () => {
      await seed();
      await asRole("anon");
      for (const query of [
        "SELECT * FROM programs",
        "SELECT price FROM programs",
        "SELECT * FROM instructors",
        "SELECT push_profile_id FROM instructors",
      ])
        await blocked(query, [], /permission denied/);
      const p = (
        await db.query("SELECT get_public_program_by_slug('safe-public') AS p")
      ).rows[0].p;
      assert.deepEqual(
        Object.keys(p).sort(),
        [
          "program_id",
          "slug",
          "title",
          "subtitle",
          "description",
          "cover_image_url",
          "location_type",
          "location_address",
          "duration_minutes",
          "total_sessions",
          "max_capacity",
          "curriculum",
          "instructor",
        ].sort(),
      );
      assert.deepEqual(
        Object.keys(p.instructor).sort(),
        ["name", "info", "photo_url", "career", "sns"].sort(),
      );
      assert.deepEqual(Object.keys(p.instructor.sns).sort(), [
        "instagram",
        "youtube",
      ]);
      assert.deepEqual(
        Object.keys(p.curriculum[0]).sort(),
        ["session", "title", "description"].sort(),
      );
      assert.ok(!JSON.stringify(p).includes("must-not-leak"));
    },
  );
  await check(
    "public RPC returns no private, draft, archived or injected slug content and supports unassigned instructors",
    async () => {
      await seed();
      for (const [isPublic, status] of [
        [false, "ACTIVE"],
        [true, "DRAFT"],
        [true, "ARCHIVED"],
      ]) {
        await asRole("postgres");
        await db.query(
          "UPDATE programs SET is_public=$1,status=$2 WHERE program_id=1",
          [isPublic, status],
        );
        await asRole("anon");
        assert.equal(
          (
            await db.query(
              "SELECT get_public_program_by_slug('safe-public') AS p",
            )
          ).rows[0].p,
          null,
        );
      }
      await seed();
      await db.exec(
        "UPDATE programs SET instructor_id=NULL WHERE program_id=1",
      );
      await asRole("anon");
      assert.equal(
        (
          await db.query(
            "SELECT get_public_program_by_slug('safe-public') AS p",
          )
        ).rows[0].p.instructor,
        null,
      );
      assert.equal(
        (
          await db.query("SELECT get_public_program_by_slug($1) AS p", [
            "' OR 1=1--",
          ])
        ).rows[0].p,
        null,
      );
    },
  );
  await check(
    "signed-in outsiders get only the public projection and cannot read another organization's raw catalog rows",
    async () => {
      await seed();
      await asRole("authenticated", adminB);
      assert.equal(
        (
          await db.query(
            "SELECT get_public_program_by_slug('safe-public') AS p",
          )
        ).rows[0].p.title,
        "Program A",
      );
      assert.equal(
        (
          await db.query("SELECT * FROM programs WHERE organization_id=$1", [
            orgA,
          ])
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "SELECT push_profile_id FROM instructors WHERE organization_id=$1",
            [orgA],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE programs SET title='foreign' WHERE program_id=1 RETURNING program_id",
          )
        ).rows.length,
        0,
      );
    },
  );
  await check(
    "own-organization admin catalog access and student active-class access remain intact",
    async () => {
      await seed();
      await asRole("authenticated", adminA);
      assert.equal(
        (await db.query("SELECT price FROM programs WHERE program_id=1"))
          .rows[0].price,
        123456,
      );
      assert.equal(
        (
          await db.query(
            "SELECT push_profile_id FROM instructors WHERE instructor_id=1",
          )
        ).rows[0].push_profile_id,
        adminA,
      );
      assert.equal(
        (
          await db.query(
            "UPDATE programs SET subtitle='managed' WHERE program_id=1 RETURNING subtitle",
          )
        ).rows[0].subtitle,
        "managed",
      );
      await asRole("authenticated", studentA);
      assert.equal(
        (await db.query("SELECT program_id FROM programs WHERE program_id=1"))
          .rows[0].program_id,
        1,
      );
      assert.equal(
        (await db.query("SELECT name FROM instructors WHERE instructor_id=1"))
          .rows[0].name,
        "Instructor A",
      );
      assert.equal(
        (
          await db.query(
            "SELECT program_id FROM programs WHERE organization_id=$1",
            [orgB],
          )
        ).rows.length,
        0,
      );
    },
  );
}
