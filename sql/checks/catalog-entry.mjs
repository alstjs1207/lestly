import assert from "node:assert/strict";

export async function checkCatalogEntry({
  db,
  check,
  asRole,
  blocked,
  source,
  orgA,
  orgB,
  studentA,
}) {
  const create = (
    org,
    { slug = null, isPublic = false, status = "ACTIVE" } = {},
  ) =>
    db.query(
      "INSERT INTO programs(organization_id,title,status,slug,is_public,duration_minutes,booking_duration_minutes,max_capacity) VALUES($1,'Catalog fixture',$2,$3,$4,50,ARRAY[50],5) RETURNING program_id,slug,is_public,instructor_id",
      [org, status, slug, isPublic],
    );
  const snapshot = async () =>
    (
      await db.query(
        "SELECT (SELECT jsonb_agg(to_jsonb(p) ORDER BY program_id) FROM programs p) programs,(SELECT jsonb_agg(to_jsonb(s) ORDER BY schedule_id) FROM schedules s) schedules,(SELECT jsonb_agg(to_jsonb(e) ORDER BY event_id) FROM attendance_events e) attendance",
      )
    ).rows;
  await check(
    "public slug migration preserves legacy public classes without modifying existing programs or reservations",
    async () => {
      await asRole("postgres");
      await create(orgA, { isPublic: true });
      const before = await snapshot();
      await db.exec(source);
      assert.deepEqual(await snapshot(), before);
      assert.equal(
        (
          await db.query(
            "SELECT convalidated FROM pg_constraint WHERE conrelid='programs'::regclass AND conname='programs_public_slug_check'",
          )
        ).rows[0].convalidated,
        false,
      );
      await blocked(
        "INSERT INTO programs(organization_id,title,is_public) VALUES($1,'missing public slug',true)",
        [orgA],
        /programs_public_slug_check/,
      );
    },
  );
  const before = await snapshot();
  await db.exec(source);
  assert.deepEqual(await snapshot(), before);

  await check(
    "private classes accept multiple empty slugs and public writes require non-whitespace slugs in every status",
    async () => {
      await asRole("postgres");
      await create(orgA);
      await create(orgA);
      await create(orgB);
      for (const status of ["DRAFT", "ACTIVE", "ARCHIVED"]) {
        for (const slug of [null, "", "   ", "\t\n"]) {
          await blocked(
            "INSERT INTO programs(organization_id,title,status,slug,is_public,duration_minutes,booking_duration_minutes,max_capacity) VALUES($1,'Invalid public',$2,$3,true,50,ARRAY[50],5)",
            [orgA, status, slug],
            /programs_public_slug_check/,
          );
        }
      }
      const privateId = (await create(orgA)).rows[0].program_id;
      await blocked(
        "UPDATE programs SET is_public=true WHERE program_id=$1",
        [privateId],
        /programs_public_slug_check/,
      );
      await db.query(
        "UPDATE programs SET slug='catalog-public-switch',is_public=true WHERE program_id=$1",
        [privateId],
      );
      await db.query(
        "UPDATE programs SET is_public=false WHERE program_id=$1",
        [privateId],
      );
      assert.equal(
        (
          await db.query("SELECT slug FROM programs WHERE program_id=$1", [
            privateId,
          ])
        ).rows[0].slug,
        "catalog-public-switch",
      );
    },
  );

  await check(
    "slug uniqueness remains global across organizations and visibility while existing case-sensitive URLs stay intact",
    async () => {
      await asRole("postgres");
      await create(orgA, { slug: "catalog-shared-slug" });
      await blocked(
        "INSERT INTO programs(organization_id,title,slug,is_public,duration_minutes,booking_duration_minutes,max_capacity) VALUES($1,'Duplicate','catalog-shared-slug',true,50,ARRAY[50],5)",
        [orgB],
        /programs_slug_unique/,
      );
      await create(orgB, { slug: "Catalog-Shared-Slug", isPublic: true });
    },
  );

  await check(
    "active classes can receive reservations without instructors and instructor selection can return to null",
    async () => {
      await asRole("postgres");
      const p = (await create(orgA)).rows[0];
      assert.equal(p.instructor_id, null);
      await db.query(
        "UPDATE profiles SET class_start_date='2000-01-01',class_end_date='2099-12-31' WHERE profile_id=$1",
        [studentA],
      );
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time) SELECT $1,$2,$3,t,t+interval '50 minutes' FROM (SELECT (((now() AT TIME ZONE 'Asia/Seoul')::date+3)+time '10:00') AT TIME ZONE 'Asia/Seoul' t) x",
        [orgA, studentA, p.program_id],
      );
      const instructor = (
        await db.query(
          "INSERT INTO instructors(organization_id,name) VALUES($1,'Optional teacher') RETURNING instructor_id",
          [orgA],
        )
      ).rows[0].instructor_id;
      await db.query(
        "UPDATE programs SET instructor_id=$1 WHERE program_id=$2",
        [instructor, p.program_id],
      );
      await db.query(
        "UPDATE programs SET instructor_id=NULL WHERE program_id=$1",
        [p.program_id],
      );
      assert.equal(
        (
          await db.query(
            "SELECT instructor_id FROM programs WHERE program_id=$1",
            [p.program_id],
          )
        ).rows[0].instructor_id,
        null,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT count(*) n FROM schedules WHERE program_id=$1",
              [p.program_id],
            )
          ).rows[0].n,
        ),
        1,
      );
    },
  );
}
