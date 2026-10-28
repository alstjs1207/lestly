import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const marker = "[이전 유형: 재수생]";

/** Exercise the real upgrade with legacy rows, then restore the pre-upgrade DB. */
export async function checkStudentMetadataMigration(db, sql) {
  const a = "99000000-0000-0000-0000-000000000001";
  const b = "99000000-0000-0000-0000-000000000002";
  const students = [3, 4, 5, 6].map(
    (n) => `99000000-0000-0000-0000-00000000000${n}`,
  );
  await db.exec("BEGIN");
  try {
    await db.query(
      "INSERT INTO organizations(organization_id,name) VALUES($1,'Upgrade A'),($2,'Upgrade B')",
      [a, b],
    );
    for (const [index, id] of students.entries()) {
      await db.query(
        "INSERT INTO profiles(profile_id,name,region,description) VALUES($1,'Upgrade student','Seoul',$2)",
        [id, ["기존 메모", null, `보존\n${marker}`, "성인 메모"][index]],
      );
    }
    await db.query(
      `INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES
      ($1,$3,'STUDENT','DROPPER'),($2,$3,'STUDENT','DROPPER'),
      ($1,$4,'STUDENT','EXAMINEE'),($1,$5,'STUDENT','DROPPER'),($1,$6,'STUDENT','ADULT'),
      ($2,$6,'ADMIN',NULL)`,
      [a, b, ...students],
    );
    // Historical migrations are replayable against their own schema, before enum removal.
    const memberships = (
      await db.query(
        "SELECT * FROM organization_members ORDER BY organization_id,profile_id",
      )
    ).rows;
    const integrity = await readFile(
      new URL(
        "../migrations/0018_student_management_integrity.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of integrity.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
    assert.deepEqual(
      (
        await db.query(
          "SELECT * FROM organization_members ORDER BY organization_id,profile_id",
        )
      ).rows,
      memberships,
    );
    assert.equal(
      (
        await db.query(
          "SELECT indisvalid FROM pg_index WHERE indexrelid='public.organization_student_phone_unique'::regclass",
        )
      ).rows[0].indisvalid,
      true,
    );
    console.log(
      "PASS student integrity migration preserves metadata when replayed before text conversion",
    );
    await db.query(
      "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES($1,$2,now()+interval '2 days',now()+interval '2 days 3 hours')",
      [a, students[0]],
    );
    const before = (await db.query("SELECT * FROM schedules")).rows;
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
    assert.equal(
      (
        await db.query(
          "SELECT data_type FROM information_schema.columns WHERE table_name='organization_members' AND column_name='type'",
        )
      ).rows[0].data_type,
      "text",
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT type FROM organization_members ORDER BY organization_id,profile_id",
        )
      ).rows.map((r) => r.type),
      ["STUDENT", "STUDENT", "STUDENT", "ADULT", "STUDENT", null],
    );
    const membershipMetadata = (rows) =>
      rows.map(({ type, updated_at, ...metadata }) => metadata);
    assert.deepEqual(
      membershipMetadata(
        (
          await db.query(
            "SELECT * FROM organization_members ORDER BY organization_id,profile_id",
          )
        ).rows,
      ),
      membershipMetadata(memberships),
    );
    assert.deepEqual(
      (
        await db.query(
          "SELECT region,description FROM profiles ORDER BY profile_id",
        )
      ).rows,
      [
        { region: "Seoul", description: `기존 메모\n${marker}` },
        { region: "Seoul", description: null },
        { region: "Seoul", description: `보존\n${marker}` },
        { region: "Seoul", description: "성인 메모" },
      ],
    );
    assert.deepEqual((await db.query("SELECT * FROM schedules")).rows, before);
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM organization_student_types"))
        .rows[0].n,
      4,
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM pg_type WHERE typname='user_type'",
        )
      ).rows[0].n,
      0,
    );
    console.log(
      "PASS student metadata upgrade preserves notes, memberships and existing bookings",
    );
  } finally {
    await db.exec("ROLLBACK");
  }
}

export async function checkStudentMetadata({
  db,
  check,
  asRole,
  blocked,
  orgA,
  orgB,
  adminA,
  studentA,
}) {
  const values = {
    name: "Metadata student",
    phone: "01044445555",
    type: "STUDENT",
  };
  const save = "SELECT save_managed_student($1,$2::jsonb,$3) id";
  await check(
    "optional region is NULL for omitted, empty and whitespace input, and clears on edit",
    async () => {
      await asRole("authenticated", adminA);
      for (const [index, region] of [undefined, "", "  ", "Seoul"].entries()) {
        const input = { ...values, phone: `0104444555${index}`, region };
        const id = (await db.query(save, [orgA, JSON.stringify(input), null]))
          .rows[0].id;
        const profile = (
          await db.query("SELECT region FROM profiles WHERE profile_id=$1", [
            id,
          ])
        ).rows[0];
        assert.equal(profile.region, region?.trim() || null);
        await db.query(save, [
          orgA,
          JSON.stringify({ ...input, region: null }),
          id,
        ]);
        assert.equal(
          (
            await db.query("SELECT region FROM profiles WHERE profile_id=$1", [
              id,
            ])
          ).rows[0].region,
          null,
        );
      }
    },
  );
  await check(
    "types stay required and must belong to the organization in RPC and direct writes",
    async () => {
      await asRole("authenticated", adminA);
      for (const type of [undefined, null, "", "UNKNOWN"]) {
        await blocked(
          save,
          [orgA, JSON.stringify({ ...values, type }), null],
          /invalid_student_values/,
        );
      }
      await asRole("service_role");
      await db.query(
        "INSERT INTO organization_student_types(organization_id,code,label,sort_order) VALUES($1,'ORG_B_ONLY','B only',2)",
        [orgB],
      );
      await blocked(
        "UPDATE organization_members SET type='ORG_B_ONLY' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
        /student_type_not_active/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        save,
        [orgA, JSON.stringify({ ...values, type: "ORG_B_ONLY" }), null],
        /invalid_student_values/,
      );
      await blocked(
        "INSERT INTO organization_student_types VALUES($1,'FORGED','forged')",
        [orgA],
        /permission denied/,
      );
      assert.ok(
        (
          await db.query(
            "SELECT organization_id FROM organization_student_types",
          )
        ).rows.every((row) => row.organization_id === orgA),
      );
    },
  );
  await check(
    "legacy RPC types map to student and keep a single retaker note",
    async () => {
      await asRole("authenticated", adminA);
      const input = { ...values, type: "DROPPER", description: "보존할 메모" };
      const id = (await db.query(save, [orgA, JSON.stringify(input), null]))
        .rows[0].id;
      assert.equal(
        (
          await db.query(
            "SELECT type FROM organization_members WHERE profile_id=$1",
            [id],
          )
        ).rows[0].type,
        "STUDENT",
      );
      const note = (
        await db.query("SELECT description FROM profiles WHERE profile_id=$1", [
          id,
        ])
      ).rows[0].description;
      assert.equal(note, `보존할 메모\n${marker}`);
      await db.query(save, [
        orgA,
        JSON.stringify({ ...input, description: note }),
        id,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT description FROM profiles WHERE profile_id=$1",
            [id],
          )
        ).rows[0].description,
        note,
      );
      await db.query(save, [
        orgA,
        JSON.stringify({ ...input, type: "EXAMINEE", description: note }),
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
    },
  );
  await check(
    "new organizations receive both default types and deletion preserves cascade behavior",
    async () => {
      await asRole("postgres");
      const id = (
        await db.query(
          "INSERT INTO organizations(name) VALUES('New metadata organization') RETURNING organization_id",
        )
      ).rows[0].organization_id;
      assert.deepEqual(
        (
          await db.query(
            "SELECT code,label FROM organization_student_types WHERE organization_id=$1 ORDER BY code",
            [id],
          )
        ).rows,
        [
          { code: "ADULT", label: "성인" },
          { code: "STUDENT", label: "학생" },
        ],
      );
      await db.query(
        "INSERT INTO organization_members(organization_id,profile_id,role,type) VALUES($1,$2,'STUDENT','STUDENT')",
        [id, studentA],
      );
      await db.query("DELETE FROM organizations WHERE organization_id=$1", [
        id,
      ]);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM organization_student_types WHERE organization_id=$1",
            [id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
}
