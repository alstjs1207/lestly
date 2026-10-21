// Isolated PostgreSQL regression suite. No credentials, network or persisted
// database are used. PGlite exercises actual SQL, triggers, constraints and RLS.
// pg_cron/pg_net extension installation is skipped; scheduler catalog/APIs and
// pgmq APIs are stubbed. Delivery, scheduling, and multi-connection contention
// must be checked in a separate Supabase staging environment.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migrationRoot = new URL("../migrations/", import.meta.url);
const db = new PGlite();
const orgA = "10000000-0000-0000-0000-000000000001";
const orgB = "10000000-0000-0000-0000-000000000002";
const adminA = "00000000-0000-0000-0000-000000000001";
const adminB = "00000000-0000-0000-0000-000000000002";
const studentA = "00000000-0000-0000-0000-000000000003";
const studentB = "00000000-0000-0000-0000-000000000004";
const claimant = "00000000-0000-0000-0000-000000000005";
const secondClaimant = "00000000-0000-0000-0000-000000000006";
const managedStudent = "00000000-0000-0000-0000-000000000099";
let passed = 0;

async function asRole(role, id = "", claims = {}) {
  assert.match(role, /^(anon|authenticated|service_role|postgres)$/);
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [id]);
  await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(claims),
  ]);
}

async function blocked(sql, params, expected) {
  await db.exec("SAVEPOINT expected_failure");
  let rejected = false;
  try {
    await db.query(sql, params);
  } catch (error) {
    rejected = true;
    assert.match(error.message, expected);
  } finally {
    await db.exec("ROLLBACK TO SAVEPOINT expected_failure");
  }
  assert.equal(rejected, true, "Expected SQL operation to be blocked");
}

async function check(name, run) {
  await db.exec("BEGIN; SET CONSTRAINTS ALL IMMEDIATE");
  try {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  } finally {
    await db.exec("ROLLBACK; RESET ROLE");
  }
}

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE supabase_admin;
    CREATE SCHEMA auth;
    CREATE SCHEMA pgmq;
    CREATE SCHEMA cron;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text,
      raw_user_meta_data jsonb, raw_app_meta_data jsonb
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;
    CREATE FUNCTION pgmq.create(text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE pgmq.test_messages (message jsonb);
    CREATE FUNCTION pgmq.send(queue_name text, msg jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO pgmq.test_messages VALUES (msg); RETURN 1; END;
    $$;
    CREATE TABLE cron.job (jobname text);
    CREATE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
    CREATE PUBLICATION supabase_realtime;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated,service_role;
  `);

  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrationRoot), "utf8"),
  );
  for (const entry of journal.entries) {
    const path = new URL(`${entry.tag}.sql`, migrationRoot);
    let sql = await readFile(path, "utf8");
    sql = sql.replace(
      /^CREATE EXTENSION IF NOT EXISTS pg_(cron|net).*;$/gm,
      "",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }
  console.log(
    `PASS fresh migration replay (${journal.entries.length} migrations)`,
  );

  await db.query(
    `
    INSERT INTO auth.users (id, raw_user_meta_data) VALUES
      ($1, '{}'), ($2, '{}'), ($3, '{}'), ($4, '{}'),
      ($5, '{"marketing_consent":"invalid","role":"super_admin"}'), ($6, '{}')
  `,
    [adminA, adminB, studentA, studentB, claimant, secondClaimant],
  );
  await db.query(
    "INSERT INTO organizations (organization_id,name) VALUES ($1,'Tenant A'),($2,'Tenant B')",
    [orgA, orgB],
  );
  await db.query(
    "INSERT INTO profiles (profile_id,name) VALUES ($1,'Managed student')",
    [managedStudent],
  );
  await db.query(
    `
    INSERT INTO organization_members (organization_id,profile_id,role) VALUES
      ($1,$3,'ADMIN'),($2,$4,'ADMIN'),($1,$5,'STUDENT'),
      ($2,$6,'STUDENT'),($1,$7,'STUDENT')
  `,
    [orgA, orgB, adminA, adminB, studentA, studentB, managedStudent],
  );
  await db.exec("UPDATE super_templates SET status='INACTIVE'");
  await db.query(
    "INSERT INTO instructors (organization_id,name) VALUES ($1,'Instructor A'),($2,'Instructor B')",
    [orgA, orgB],
  );
  await db.query(
    "INSERT INTO programs (organization_id,title,status) VALUES ($1,'Program A','ACTIVE'),($2,'Program B','ACTIVE')",
    [orgA, orgB],
  );
  await db.query(
    `
    INSERT INTO schedules (organization_id,student_id,program_id,start_time,end_time) VALUES
      ($1,$3,1,now()-interval '2 days',now()-interval '2 days'+interval '1 hour'),
      ($2,$4,2,now()-interval '2 days',now()-interval '2 days'+interval '2 hours')
  `,
    [orgA, orgB, studentA, studentB],
  );
  await db.query(
    `
    INSERT INTO student_invites (organization_id,profile_id,token_hash,expires_at,created_by_profile_id,created_at)
    VALUES ($1,$2,'valid-invite',now()+interval '1 day',$3,now()),
           ($1,$2,'second-invite',now()+interval '1 day',$3,now()),
           ($1,$2,'expired-invite',now()-interval '1 hour',$3,now()-interval '2 days')
  `,
    [orgA, managedStudent, adminA],
  );

  await check(
    "student RLS and totals isolate both tenant and profile",
    async () => {
      await asRole("authenticated", studentA);
      const own = await db.query("SELECT student_id FROM schedules");
      assert.deepEqual(
        own.rows.map((row) => row.student_id),
        [studentA],
      );
      const memberships = await db.query(
        "SELECT profile_id FROM organization_members",
      );
      assert.deepEqual(
        memberships.rows.map((row) => row.profile_id),
        [studentA],
      );
      const totals = await db.query(
        "SELECT * FROM get_student_total_hours($1)",
        [[studentA, studentB]],
      );
      assert.deepEqual(totals.rows, [{ student_id: studentA, total_hours: 1 }]);
      await blocked(
        `INSERT INTO schedules (organization_id,student_id,start_time,end_time)
      VALUES ($1,$2,now(),now()+interval '1 hour')`,
        [orgB, studentA],
        /schedule_student_not_eligible|row-level security/,
      );
      await blocked(
        `INSERT INTO schedules (organization_id,student_id,start_time,end_time)
      VALUES ($1,$2,now(),now()+interval '1 hour')`,
        [orgA, managedStudent],
        /row-level security/,
      );
    },
  );

  await check(
    "admin cannot attach a foreign profile or change membership identity",
    async () => {
      await asRole("authenticated", adminA);
      assert.equal(
        (
          await db.query("SELECT * FROM profiles WHERE profile_id=$1", [
            studentB,
          ])
        ).rows.length,
        0,
      );
      await blocked(
        "INSERT INTO organization_members (organization_id,profile_id) VALUES ($1,$2)",
        [orgA, studentB],
        /row-level security/,
      );
      await blocked(
        "UPDATE organization_members SET profile_id=$1 WHERE organization_id=$2 AND profile_id=$3",
        [studentB, orgA, studentA],
        /membership_identity_update_not_allowed/,
      );
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      );
      assert.equal(
        (
          await db.query("SELECT * FROM get_student_total_hours($1,$2)", [
            [studentB],
            orgB,
          ])
        ).rows.length,
        0,
      );
    },
  );

  await check(
    "tenant FKs block foreign instructor/program/student references",
    async () => {
      await asRole("authenticated", adminA);
      await blocked(
        "INSERT INTO programs (organization_id,title,instructor_id) VALUES ($1,'bad',2)",
        [orgA],
        /programs_instructor_tenant_fk/,
      );
      await blocked(
        `INSERT INTO schedules (organization_id,student_id,program_id,start_time,end_time)
      VALUES ($1,$2,2,now(),now()+interval '1 hour')`,
        [orgA, studentA],
        /schedules_program_tenant_fk/,
      );
      await blocked(
        `INSERT INTO schedules (organization_id,student_id,start_time,end_time)
      VALUES ($1,$2,now(),now()+interval '1 hour')`,
        [orgA, studentB],
        /schedule_student_not_eligible/,
      );
      await blocked(
        `INSERT INTO schedules (organization_id,student_id,start_time,end_time)
      VALUES ($1,$2,now(),now()-interval '1 hour')`,
        [orgA, studentA],
        /schedules_valid_time_range/,
      );
    },
  );

  await check(
    "anonymous requests cannot bypass server validation or invoke stats",
    async () => {
      await asRole("anon");
      await blocked(
        "INSERT INTO notifications (organization_id,type,recipient_phone) VALUES ($1,'CONSULT_REQUEST','01012345678')",
        [orgA],
        /permission denied|row-level security/,
      );
      await blocked(
        "SELECT * FROM get_student_total_hours($1)",
        [[studentA]],
        /permission denied/,
      );
      assert.equal((await db.query("SELECT * FROM profiles")).rows.length, 0);
    },
  );

  await check(
    "anonymous public class reads work without access to private records",
    async () => {
      await db.exec(
        "UPDATE programs SET is_public=true,instructor_id=1 WHERE program_id=1",
      );
      await asRole("anon");
      assert.deepEqual(
        (await db.query("SELECT program_id FROM programs")).rows,
        [{ program_id: 1 }],
      );
      assert.deepEqual(
        (await db.query("SELECT instructor_id FROM instructors")).rows,
        [{ instructor_id: 1 }],
      );
      // Organizations have never been public; a class page reads its public
      // program/instructor, while a direct organizations query returns no rows.
      assert.equal(
        (await db.query("SELECT * FROM organizations")).rows.length,
        0,
      );
    },
  );

  await check(
    "active programs remain accessible across N:N memberships",
    async () => {
      await db.query(
        "INSERT INTO organization_members (organization_id,profile_id) VALUES ($1,$2)",
        [orgB, studentA],
      );
      await asRole("authenticated", studentA);
      assert.deepEqual(
        (await db.query("SELECT program_id FROM programs ORDER BY program_id"))
          .rows,
        [{ program_id: 1 }, { program_id: 2 }],
      );
    },
  );

  await check("client admins cannot forge or retarget invites", async () => {
    await asRole("authenticated", adminA);
    await blocked(
      `INSERT INTO student_invites (organization_id,profile_id,token_hash,expires_at,created_by_profile_id)
      VALUES ($1,$2,'forged',now()+interval '1 day',$3)`,
      [orgA, studentB, adminA],
      /row-level security/,
    );
    const changed = await db.query(
      "UPDATE student_invites SET profile_id=$1 WHERE token_hash='valid-invite' RETURNING invite_id",
      [studentB],
    );
    assert.equal(changed.rows.length, 0);
  });

  await check(
    "invite claims link existing profile atomically and reject relinking",
    async () => {
      await asRole("authenticated", claimant);
      await blocked(
        "SELECT claim_student_invite('expired-invite')",
        [],
        /invalid_or_expired_invite/,
      );
      await blocked(
        "SELECT claim_student_invite('missing-invite')",
        [],
        /invalid_or_expired_invite/,
      );
      assert.equal(
        (
          await db.query(
            "SELECT claim_student_invite('valid-invite') AS profile_id",
          )
        ).rows[0].profile_id,
        managedStudent,
      );
      assert.equal(
        (await db.query("SELECT get_current_profile_id() AS profile_id"))
          .rows[0].profile_id,
        managedStudent,
      );
      assert.equal(
        (await db.query("SELECT is_org_member($1) AS is_member", [orgA]))
          .rows[0].is_member,
        true,
      );
      await asRole("authenticated", secondClaimant);
      await blocked(
        "SELECT claim_student_invite('second-invite')",
        [],
        /student_already_linked/,
      );
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT auth_user_id FROM profiles WHERE profile_id=$1",
            [managedStudent],
          )
        ).rows[0].auth_user_id,
        claimant,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM profiles WHERE profile_id=$1", [
            claimant,
          ])
        ).rows.length,
        0,
      );
    },
  );

  await check(
    "invalid consent metadata succeeds without granting privileges",
    async () => {
      await asRole("authenticated", claimant);
      const profile = (
        await db.query(
          "SELECT marketing_consent FROM profiles WHERE auth_user_id=$1",
          [claimant],
        )
      ).rows[0];
      assert.equal(profile.marketing_consent, false);
      assert.equal(
        (
          await db.query(
            "SELECT is_super_admin() AS allowed, is_admin() AS admin",
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (await db.query("SELECT is_admin() AS admin")).rows[0].admin,
        false,
      );
      await blocked(
        "UPDATE profiles SET auth_user_id=$1 WHERE auth_user_id=$2",
        [secondClaimant, claimant],
        /auth_link_update_not_allowed/,
      );
    },
  );

  await check(
    "stats aggregate more than 1,000 rows without fetching histories",
    async () => {
      await db.query(
        `
      INSERT INTO schedules (organization_id,student_id,start_time,end_time)
      SELECT $1,$2,now()-interval '3 days',now()-interval '3 days'+interval '1 hour'
      FROM generate_series(1,1005)
    `,
        [orgA, studentA],
      );
      await asRole("authenticated", studentA);
      const row = (
        await db.query("SELECT * FROM get_student_total_hours($1,$2)", [
          [studentA],
          orgA,
        ])
      ).rows[0];
      assert.equal(row.total_hours, 1006);
    },
  );

  await check(
    "trusted server membership and invite operations stay permitted",
    async () => {
      await asRole("service_role");
      await db.query(
        "INSERT INTO organization_members (organization_id,profile_id,role) VALUES ($1,$2,'ADMIN')",
        [orgB, claimant],
      );
      await db.query(
        "UPDATE student_invites SET revoked_at=now() WHERE token_hash='second-invite'",
      );
      assert.equal(
        (
          await db.query("SELECT * FROM get_student_total_hours($1)", [
            [studentA, studentB],
          ])
        ).rows.length,
        2,
      );
    },
  );

  await check(
    "welcome queue contains only a name and authoritative email",
    async () => {
      await db.exec(`
      ALTER TABLE auth.users ADD COLUMN recovery_token text;
      CREATE TRIGGER test_welcome AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.welcome_email();
      INSERT INTO auth.users (id,email,recovery_token,raw_user_meta_data)
      VALUES ('00000000-0000-0000-0000-000000000007','actual@example.test','secret-token',
              '{"name":"New student","email":"untrusted@example.test"}');
    `);
      const messages = (
        await db.query("SELECT message FROM pgmq.test_messages")
      ).rows;
      assert.deepEqual(messages, [
        {
          message: {
            template: "welcome",
            to: "actual@example.test",
            data: { name: "New student" },
          },
        },
      ]);
    },
  );

  await check(
    "tenant foreign keys preserve existing deletion cleanup",
    async () => {
      await asRole("service_role");
      await db.query("DELETE FROM programs WHERE program_id=1");
      assert.equal(
        (
          await db.query(
            "SELECT program_id FROM schedules WHERE student_id=$1",
            [studentA],
          )
        ).rows[0].program_id,
        null,
      );
    },
  );

  console.log(
    `SQL security regression: ${passed} checks passed; migrations from ${fileURLToPath(migrationRoot)}`,
  );
} catch (error) {
  console.error(`SQL security regression failed: ${error.message}`);
  if (error.query) console.error(error.query.slice(0, 1000));
  process.exitCode = 1;
} finally {
  await db.close();
}
