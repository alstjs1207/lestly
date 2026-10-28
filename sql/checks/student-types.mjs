import assert from "node:assert/strict";

export async function checkStudentTypePolicyMigration(db, sql) {
  const org = "98000000-0000-0000-0000-000000000001";
  const id = "98000000-0000-0000-0000-000000000002";
  await db.exec("BEGIN");
  try {
    await db.query(
      "INSERT INTO organizations(organization_id,name) VALUES($1,'Policy upgrade')",
      [org],
    );
    await db.query(
      "INSERT INTO profiles(profile_id,name,description,phone) VALUES($1,'Existing student','보존할 메모','01011112222')",
      [id],
    );
    await db.query(
      "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
      [org, id],
    );
    await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '2 days',now()+interval '2 days 3 hours')",
      [org, id],
    );
    const snapshot =
      "SELECT (SELECT jsonb_agg(m) FROM organization_members m) members,(SELECT jsonb_agg(p) FROM profiles p) profiles,(SELECT jsonb_agg(s) FROM schedules s) schedules";
    const before = (await db.query(snapshot)).rows;
    for (const statement of sql.split("--> statement-breakpoint"))
      if (statement.trim()) await db.exec(statement);
    assert.deepEqual((await db.query(snapshot)).rows, before);
    assert.deepEqual(
      (
        await db.query(
          "SELECT code,sort_order,is_active,is_default FROM organization_student_types ORDER BY sort_order",
        )
      ).rows,
      [
        { code: "STUDENT", sort_order: 0, is_active: true, is_default: true },
        { code: "ADULT", sort_order: 1, is_active: true, is_default: false },
      ],
    );
    await db.exec("SET CONSTRAINTS student_types_policy_valid IMMEDIATE");
    console.log(
      "PASS organization type policy upgrade preserves existing profiles, memberships and bookings",
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}

export async function checkStudentTypes({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  adminB,
  studentA,
}) {
  const list = async (org = orgA) =>
    (
      await db.query(
        "SELECT code,label,sort_order,is_active,is_default FROM organization_student_types WHERE organization_id=$1 ORDER BY sort_order,code",
        [org],
      )
    ).rows;
  const rpc = "SELECT save_student_types($1,$2,$3)";
  const args = (types, expected, org = orgA) => [
    org,
    JSON.stringify(types),
    JSON.stringify(expected),
  ];
  const changed = (before) => [
    {
      code: "TYPE_CHILD",
      label: "어린이",
      sort_order: 0,
      is_active: true,
      is_default: true,
    },
    { ...before[0], label: "청소년", sort_order: 1, is_default: false },
    { ...before[1], sort_order: 2 },
  ];
  const snapshot =
    "SELECT (SELECT jsonb_agg(m) FROM organization_members m) members,(SELECT jsonb_agg(p) FROM profiles p) profiles,(SELECT jsonb_agg(s) FROM schedules s) schedules";
  await check(
    "organization type edits preserve identifiers, members, profiles and bookings",
    async () => {
      const before = await list();
      const baseline = (await db.query(snapshot)).rows;
      await asRole("authenticated", adminA);
      await db.query(rpc, args(changed(before), before));
      assert.deepEqual(await list(), changed(before));
      await asRole("postgres");
      assert.deepEqual((await db.query(snapshot)).rows, baseline);
      assert.equal((await list(orgB))[0].label, "학생");
      await db.exec("SET CONSTRAINTS student_types_policy_valid IMMEDIATE");
    },
  );
  await check(
    "type RPC rejects invalid policies, missing existing codes and stale edits atomically",
    async () => {
      const before = await list();
      await asRole("authenticated", adminA);
      const invalid = [
        [],
        before.map((t) => ({ ...t, is_active: false, is_default: false })),
        before.map((t) => ({ ...t, is_default: false })),
        before.map((t) => ({ ...t, is_default: true })),
        before.map((t) => ({ ...t, label: "same" })),
        before.map((t) => ({ ...t, sort_order: 0 })),
        before.map((t) =>
          t.code === "STUDENT" ? { ...t, is_active: false } : t,
        ),
        [{ ...before[0], label: " " }, before[1]],
      ];
      for (const types of invalid)
        await blocked(rpc, args(types, before), /invalid_student_types/);
      await blocked(
        rpc,
        args([before[0]], before),
        /student_types_cannot_remove/,
      );
      assert.deepEqual(await list(), before);
      await db.query(rpc, args(changed(before), before));
      await blocked(rpc, args(before, before), /student_types_conflict/);
      assert.deepEqual(await list(), changed(before));
    },
  );
  await check(
    "type management and helpers reject anonymous, student and foreign-admin access",
    async () => {
      const before = await list();
      await asRole("anon");
      await blocked(rpc, args(before, before), /permission denied/);
      for (const user of [studentA, adminB]) {
        await asRole("authenticated", user);
        await blocked(rpc, args(before, before), /student_types_access_denied/);
        await blocked(
          "SELECT student_types_snapshot($1)",
          [orgA],
          /permission denied/,
        );
      }
      await asRole("authenticated", adminA);
      await blocked(
        "UPDATE organization_student_types SET label='forged' WHERE organization_id=$1",
        [orgA],
        /permission denied/,
      );
    },
  );
  await check(
    "inactive types preserve current assignments and bookings but reject new assignments",
    async () => {
      const before = await list();
      await asRole("authenticated", adminA);
      const values = {
        name: "Retained type",
        phone: "01077778888",
        type: "STUDENT",
      };
      const id = (
        await db.query("SELECT save_managed_student($1,$2,NULL) id", [
          orgA,
          values,
        ])
      ).rows[0].id;
      await db.query(
        "SELECT create_admin_schedule_series($1,$2,NULL,$3,NULL)",
        [
          orgA,
          id,
          JSON.stringify([
            {
              start_time: new Date(Date.now() + 5 * 86400000).toISOString(),
              end_time: new Date(
                Date.now() + 5 * 86400000 + 10800000,
              ).toISOString(),
            },
          ]),
        ],
      );
      const schedules = (
        await db.query("SELECT * FROM schedules WHERE student_id=$1", [id])
      ).rows;
      const profile = (
        await db.query("SELECT * FROM profiles WHERE profile_id=$1", [id])
      ).rows[0];
      await db.query(
        rpc,
        args(
          before.map((t) => ({
            ...t,
            is_active: t.code !== "STUDENT",
            is_default: t.code === "ADULT",
          })),
          before,
        ),
      );
      await blocked(
        "SELECT save_managed_student($1,$2,NULL)",
        [orgA, { ...values, phone: "01077778889" }],
        /invalid_student_values/,
      );
      await db.query("SELECT save_managed_student($1,$2,$3)", [
        orgA,
        {
          ...values,
          class_start_date: profile.class_start_date,
          class_end_date: profile.class_end_date,
          description: "설명만 수정",
        },
        id,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT type FROM organization_members WHERE profile_id=$1",
            [id],
          )
        ).rows[0].type,
        "STUDENT",
      );
      assert.deepEqual(
        (await db.query("SELECT * FROM schedules WHERE student_id=$1", [id]))
          .rows,
        schedules,
      );
      const other = (
        await db.query("SELECT save_managed_student($1,$2,NULL) id", [
          orgA,
          { ...values, phone: "01077778889", type: "ADULT" },
        ])
      ).rows[0].id;
      await blocked(
        "UPDATE organization_members SET type='STUDENT' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, other],
        /student_type_not_active/,
      );
      await blocked(
        "UPDATE organization_members SET type=NULL WHERE organization_id=$1 AND profile_id=$2",
        [orgA, other],
        /student_type_required/,
      );
    },
  );
  await check(
    "database constraints guard direct policy writes and permit organization cascade deletion",
    async () => {
      await asRole("postgres");
      await blocked(
        "DELETE FROM organization_student_types WHERE organization_id=$1",
        [orgA],
        /student_types_cannot_remove/,
      );
      await blocked(
        "UPDATE organization_student_types SET code='REKEY' WHERE organization_id=$1 AND code='STUDENT'",
        [orgA],
        /student_types_cannot_rekey/,
      );
      for (const sql of [
        "UPDATE organization_student_types SET is_default=false WHERE organization_id=$1",
        "UPDATE organization_student_types SET label='중복' WHERE organization_id=$1",
        "UPDATE organization_student_types SET sort_order=sort_order+2 WHERE organization_id=$1",
      ]) {
        await db.exec("SAVEPOINT invalid_catalog");
        try {
          await db.exec("SET CONSTRAINTS student_types_policy_valid DEFERRED");
          await db.query(sql, [orgA]);
          await assert.rejects(
            db.exec("SET CONSTRAINTS student_types_policy_valid IMMEDIATE"),
            /invalid_student_types/,
          );
        } finally {
          await db.exec("ROLLBACK TO SAVEPOINT invalid_catalog");
        }
      }
      const id = (
        await db.query(
          "INSERT INTO organizations(name) VALUES('Catalog cascade') RETURNING organization_id",
        )
      ).rows[0].organization_id;
      assert.equal(
        (await list(id)).filter((t) => t.is_default && t.is_active).length,
        1,
      );
      await db.query("DELETE FROM organizations WHERE organization_id=$1", [
        id,
      ]);
      await db.exec("SET CONSTRAINTS student_types_policy_valid IMMEDIATE");
    },
  );
}
