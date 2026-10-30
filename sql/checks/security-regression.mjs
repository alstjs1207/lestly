// Isolated PostgreSQL regression suite. No credentials, network or persisted
// database are used. PGlite exercises actual SQL, triggers, constraints and RLS.
// pg_cron/pg_net extension installation is skipped; scheduler catalog/APIs and
// pgmq APIs are stubbed. Delivery, scheduling, and multi-connection contention
// must be checked in a separate Supabase staging environment.
import { PGlite } from "@electric-sql/pglite";
import { sql as drizzleSql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { loadMockedModule } from "../../tests/helpers/mocked-module.ts";
import { checkAttendance } from "./attendance.mjs";
import {
  checkBookingPolicy,
  checkBookingPolicyMigration,
} from "./booking-policy.mjs";
import {
  checkBookingWindow,
  checkBookingWindowMigration,
} from "./booking-window.mjs";
import {
  checkCancellationMigration,
  checkCancellationPolicy,
} from "./cancellation-policy.mjs";
import { checkClassBookingPolicy } from "./class-booking-policy.mjs";
import { checkSettingsSections } from "./settings-sections.mjs";
import { checkStudentLifecyclePerformance } from "./student-lifecycle-performance.mjs";
import { checkStudentLifecycle } from "./student-lifecycle.mjs";
import {
  checkStudentMetadata,
  checkStudentMetadataMigration,
} from "./student-metadata.mjs";
import {
  checkStudentTypePolicyMigration,
  checkStudentTypes,
} from "./student-types.mjs";

const migrationRoot = new URL("../migrations/", import.meta.url);
const db = new PGlite();
const dialect = new PgDialect();
const pushStore = loadMockedModule(
  new URL(
    "../../app/features/notifications/push/store.server.ts",
    import.meta.url,
  ),
  {
    "drizzle-orm": { sql: drizzleSql },
    "~/core/db/drizzle-client.server": {
      default: {
        async execute(query) {
          const { sql, params } = dialect.sqlToQuery(query);
          return (await db.query(sql, params)).rows;
        },
        async transaction(run) {
          await db.exec("SAVEPOINT push_store_transaction");
          try {
            const result = await run(this);
            await db.exec("RELEASE SAVEPOINT push_store_transaction");
            return result;
          } catch (error) {
            await db.exec("ROLLBACK TO SAVEPOINT push_store_transaction");
            throw error;
          }
        },
      },
    },
  },
);
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
let lifecycleBaseline;
let studentEditBaseline;

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
  assert.equal(rejected, true, `Expected SQL operation to be blocked: ${sql}`);
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

async function seedIdentity(
  identityData,
  { provider = "kakao", userId = claimant } = {},
) {
  await db.query(
    "INSERT INTO auth.identities (user_id,provider,identity_data) VALUES ($1,$2,$3)",
    [userId, provider, JSON.stringify(identityData)],
  );
}

async function claimWithContactEmail() {
  await asRole("authenticated", claimant);
  const { rows } = await db.query(
    "SELECT claim_student_invite_with_contact_email('valid-invite') AS profile_id",
  );
  assert.equal(rows[0].profile_id, managedStudent);
  return (
    await db.query(
      "SELECT auth_user_id,contact_email,name,phone FROM profiles WHERE profile_id=$1",
      [managedStudent],
    )
  ).rows[0];
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
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, allowed_mime_types text[]);
    INSERT INTO storage.buckets VALUES ('avatars',ARRAY['image/*']),('coverimages',ARRAY['image/*']),('instructors',ARRAY['image/*']);
    CREATE TABLE storage.objects(name text PRIMARY KEY,bucket_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO authenticated,service_role;
    GRANT ALL ON storage.objects TO authenticated,service_role;
    CREATE POLICY catalog_read ON storage.objects FOR SELECT TO authenticated USING(true);
    CREATE POLICY catalog_cover_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='coverimages');
    CREATE POLICY catalog_instructor_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='instructors');
    CREATE POLICY catalog_cover_update ON storage.objects FOR UPDATE TO authenticated USING(bucket_id='coverimages');

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text,
      raw_user_meta_data jsonb, raw_app_meta_data jsonb
    );
    CREATE TABLE auth.identities (
      user_id uuid NOT NULL REFERENCES auth.users(id),
      provider text NOT NULL,
      identity_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
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
  for (const entry of journal.entries.filter((e) => e.idx < 36)) {
    if (entry.idx === 24) {
      lifecycleBaseline = {
        policies: (
          await db.query(
            "SELECT tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('schedules','profiles','organization_members','programs','instructors')",
          )
        ).rows,
        functions: (
          await db.query(
            "SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE oid IN ('public.get_current_profile_id()'::regprocedure,'public.is_org_admin(uuid)'::regprocedure,'public.is_super_admin()'::regprocedure)",
          )
        ).rows.map((r) => r.definition),
        scheduleReadPolicy: `ALTER POLICY "student-select-own-schedules-policy" ON schedules USING (student_id=public.get_current_profile_id() AND public.is_org_member(organization_id))`,
      };
    }
    if (entry.idx === 25)
      studentEditBaseline = (
        await db.query(
          "SELECT pg_get_functiondef('public.save_managed_student(uuid,jsonb,uuid)'::regprocedure) definition",
        )
      ).rows[0].definition;
    const path = new URL(`${entry.tag}.sql`, migrationRoot);
    let sql = await readFile(path, "utf8");
    if (entry.idx === 29) await checkStudentMetadataMigration(db, sql);
    if (entry.idx === 30) await checkStudentTypePolicyMigration(db, sql);
    if (entry.idx === 32) await checkBookingPolicyMigration(db, sql);
    if (entry.idx === 34) await checkBookingWindowMigration(db, sql);
    if (entry.idx === 35) await checkCancellationMigration(db, sql);
    sql = sql.replace(
      /^CREATE EXTENSION IF NOT EXISTS pg_(cron|net).*;$/gm,
      "",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
  }
  console.log(
    `PASS fresh migration replay (${journal.entries.filter((e) => e.idx < 36).length} historical migrations)`,
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
      // The old RPC remains compatible while preview uses attended hours.
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
        /row-level security|schedule_not_authorized/,
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
        /row-level security|schedule_not_authorized/,
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
        /schedules_program_tenant_fk|schedule_program_not_eligible/,
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
        /schedules_valid_time_range|schedule_invalid_interval/,
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
      /row-level security|schedule_not_authorized|student_not_eligible/,
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

  for (const emptyEmail of [null, "", "   "]) {
    await check(
      `invite fills ${JSON.stringify(emptyEmail)} contact email from verified Kakao identity`,
      async () => {
        await db.query(
          "UPDATE profiles SET contact_email=$1,phone='01012345678' WHERE profile_id=$2",
          [emptyEmail, managedStudent],
        );
        await db.query(
          "UPDATE auth.users SET email='auth-only@example.test' WHERE id=$1",
          [claimant],
        );
        await db.query(
          "UPDATE profiles SET contact_email='editable-profile@example.test' WHERE auth_user_id=$1",
          [claimant],
        );
        await seedIdentity({
          email: "  kakao@example.test  ",
          email_verified: true,
        });
        assert.deepEqual(await claimWithContactEmail(), {
          auth_user_id: claimant,
          contact_email: "kakao@example.test",
          name: "Managed student",
          phone: "01012345678",
        });
        await asRole("postgres");
        assert.ok(
          (
            await db.query(
              "SELECT used_at FROM student_invites WHERE token_hash='valid-invite'",
            )
          ).rows[0].used_at,
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
  }

  await check(
    "invite preserves the administrator's existing contact email",
    async () => {
      await db.query(
        "UPDATE profiles SET contact_email='admin-entered@example.test' WHERE profile_id=$1",
        [managedStudent],
      );
      await seedIdentity({ email: "kakao@example.test", email_verified: true });
      assert.equal(
        (await claimWithContactEmail()).contact_email,
        "admin-entered@example.test",
      );
    },
  );

  const ignoredIdentities = [
    { name: "no Kakao identity", data: null },
    { name: "missing email", data: { email_verified: true } },
    { name: "empty email", data: { email: "", email_verified: true } },
    { name: "blank email", data: { email: "   ", email_verified: true } },
    {
      name: "unverified email",
      data: { email: "unverified@example.test", email_verified: false },
    },
    { name: "missing verification", data: { email: "unchecked@example.test" } },
    {
      name: "another provider",
      data: { email: "github@example.test", email_verified: true },
      provider: "github",
    },
    {
      name: "another user",
      data: { email: "foreign@example.test", email_verified: true },
      userId: secondClaimant,
    },
  ];
  for (const scenario of ignoredIdentities) {
    await check(
      `invite succeeds without filling from ${scenario.name} or editable metadata`,
      async () => {
        await db.query(
          `UPDATE auth.users SET email='account-only@example.test',raw_user_meta_data='{"email":"spoofed@example.test","email_verified":true}' WHERE id=$1`,
          [claimant],
        );
        await db.query(
          "UPDATE profiles SET contact_email='editable-profile@example.test' WHERE auth_user_id=$1",
          [claimant],
        );
        if (scenario.data) await seedIdentity(scenario.data, scenario);
        const profile = await claimWithContactEmail();
        assert.equal(profile.auth_user_id, claimant);
        assert.equal(profile.contact_email, null);
      },
    );
  }

  await check(
    "email enrichment cannot bypass authentication or expired invitations",
    async () => {
      await seedIdentity({ email: "kakao@example.test", email_verified: true });
      await asRole("anon");
      await blocked(
        "SELECT claim_student_invite_with_contact_email('valid-invite')",
        [],
        /permission denied/,
      );
      await asRole("authenticated");
      await blocked(
        "SELECT claim_student_invite_with_contact_email('valid-invite')",
        [],
        /authentication_required/,
      );
      await asRole("authenticated", claimant);
      await blocked(
        "SELECT claim_student_invite_with_contact_email('expired-invite')",
        [],
        /invalid_or_expired_invite/,
      );
      await asRole("postgres");
      const profile = (
        await db.query(
          "SELECT auth_user_id,contact_email FROM profiles WHERE profile_id=$1",
          [managedStudent],
        )
      ).rows[0];
      assert.deepEqual(profile, { auth_user_id: null, contact_email: null });
    },
  );

  await check(
    "email update failure rolls back the account link, invite use and bootstrap deletion",
    async () => {
      await seedIdentity({ email: "kakao@example.test", email_verified: true });
      await db.exec(`
      CREATE FUNCTION public.test_reject_contact_email() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test_email_update_failed'; END; $$;
      CREATE TRIGGER test_reject_contact_email BEFORE UPDATE OF contact_email ON profiles
      FOR EACH ROW EXECUTE FUNCTION public.test_reject_contact_email();
    `);
      await asRole("authenticated", claimant);
      await blocked(
        "SELECT claim_student_invite_with_contact_email('valid-invite')",
        [],
        /test_email_update_failed/,
      );
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT auth_user_id FROM profiles WHERE profile_id=$1",
            [managedStudent],
          )
        ).rows[0].auth_user_id,
        null,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM profiles WHERE profile_id=$1", [
            claimant,
          ])
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "SELECT used_at FROM student_invites WHERE token_hash='valid-invite'",
          )
        ).rows[0].used_at,
        null,
      );
    },
  );

  await check(
    "existing deployments retain the original claim behavior",
    async () => {
      await seedIdentity({ email: "kakao@example.test", email_verified: true });
      await asRole("authenticated", claimant);
      await db.query("SELECT claim_student_invite('valid-invite')");
      assert.equal(
        (
          await db.query(
            "SELECT contact_email FROM profiles WHERE profile_id=$1",
            [managedStudent],
          )
        ).rows[0].contact_email,
        null,
      );
    },
  );

  await check(
    "email enrichment also works with the deployed 0015 claim function",
    async () => {
      const legacy = await readFile(
        new URL("0015_optional_student_email_and_invites.sql", migrationRoot),
        "utf8",
      );
      const definition = legacy.match(
        /CREATE OR REPLACE FUNCTION public\.claim_student_invite\(p_token_hash text\)[\s\S]*?\$\$;/,
      )?.[0];
      assert.ok(definition);
      await db.exec(definition);
      await seedIdentity({ email: "kakao@example.test", email_verified: true });
      assert.equal(
        (await claimWithContactEmail()).contact_email,
        "kakao@example.test",
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
      SELECT $1,$2,now()-i*interval '1 day'-interval '10 days',now()-i*interval '1 day'-interval '10 days'+interval '1 hour'
      FROM generate_series(1,1005) AS i
    `,
        [orgA, studentA],
      );
      await asRole("authenticated", adminA);
      const rows = (
        await db.query(
          "SELECT schedule_id,attendance_version FROM schedules WHERE organization_id=$1 AND student_id=$2 AND end_time<now()-interval '10 days'",
          [orgA, studentA],
        )
      ).rows;
      for (let i = 0; i < rows.length; i += 200)
        await db.query("SELECT save_attendance($1,$2)", [
          orgA,
          JSON.stringify(
            rows.slice(i, i + 200).map((s) => ({
              schedule_id: s.schedule_id,
              version: s.attendance_version,
              status: "PRESENT",
            })),
          ),
        ]);
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
    "email-less Kakao signup creates a profile and skips welcome mail",
    async () => {
      const id = "00000000-0000-0000-0000-000000000008";
      await db.exec(`
      CREATE TRIGGER test_welcome AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.welcome_email();
    `);
      await db.query(
        `INSERT INTO auth.users (id,email,raw_user_meta_data)
       VALUES ($1,NULL,'{"name":"Kakao student","provider_id":"12345"}')`,
        [id],
      );
      const { rows } = await db.query(
        "SELECT auth_user_id, contact_email, name FROM profiles WHERE profile_id=$1",
        [id],
      );
      assert.deepEqual(rows, [
        { auth_user_id: id, contact_email: null, name: "Kakao student" },
      ]);
      assert.equal(
        (await db.query("SELECT * FROM pgmq.test_messages")).rows.length,
        0,
      );
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

  const studentValues = {
    name: "Atomic student",
    phone: "010-5555-1234",
    region: "서울",
    type: "STUDENT",
  };
  const saveStudentSql =
    "SELECT save_managed_student($1,$2::jsonb,$3) AS profile_id";

  await check(
    "managed student RPC rejects anonymous, non-admin and foreign-tenant callers",
    async () => {
      await asRole("anon");
      await blocked(
        saveStudentSql,
        [orgA, JSON.stringify(studentValues), null],
        /permission denied/,
      );
      await asRole("authenticated", studentA);
      await blocked(
        saveStudentSql,
        [orgA, JSON.stringify(studentValues), null],
        /student_access_denied/,
      );
      await asRole("authenticated", adminA);
      await blocked(
        saveStudentSql,
        [orgB, JSON.stringify(studentValues), null],
        /student_access_denied/,
      );
    },
  );

  await check(
    "managed student RPC rejects admin and foreign-student targets without changing them",
    async () => {
      await asRole("authenticated", adminA);
      const before = (
        await db.query("SELECT name FROM profiles WHERE profile_id=$1", [
          adminA,
        ])
      ).rows;
      await blocked(
        saveStudentSql,
        [orgA, JSON.stringify({ ...studentValues, state: "DELETED" }), adminA],
        /student_not_found/,
      );
      await blocked(
        saveStudentSql,
        [orgA, JSON.stringify(studentValues), studentB],
        /student_not_found/,
      );
      assert.deepEqual(
        (
          await db.query("SELECT name FROM profiles WHERE profile_id=$1", [
            adminA,
          ])
        ).rows,
        before,
      );
      assert.equal(
        (
          await db.query(
            "SELECT state FROM organization_members WHERE profile_id=$1",
            [adminA],
          )
        ).rows[0].state,
        "NORMAL",
      );
    },
  );

  await check(
    "normalized phone unique constraint blocks duplicate creates without leaving orphan profiles",
    async () => {
      await asRole("authenticated", adminA);
      const id = (
        await db.query(saveStudentSql, [
          orgA,
          JSON.stringify(studentValues),
          null,
        ])
      ).rows[0].profile_id;
      const profile = (
        await db.query(
          "SELECT phone,phone_normalized,auth_user_id FROM profiles WHERE profile_id=$1",
          [id],
        )
      ).rows[0];
      assert.deepEqual(profile, {
        phone: "01055551234",
        phone_normalized: "01055551234",
        auth_user_id: null,
      });
      await blocked(
        saveStudentSql,
        [
          orgA,
          JSON.stringify({
            ...studentValues,
            name: "Rejected duplicate",
            phone: "01055551234",
          }),
          null,
        ],
        /organization_student_phone_unique/,
      );
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT * FROM profiles WHERE name='Rejected duplicate'",
          )
        ).rows.length,
        0,
      );
    },
  );

  await check(
    "membership failure rolls back all profile and state changes in managed student update",
    async () => {
      await db.query(
        "UPDATE profiles SET name='Before',phone='01011110000' WHERE profile_id=$1",
        [studentA],
      );
      await db.exec(`CREATE FUNCTION public.test_reject_student_type() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test_membership_failure'; END $$;
      CREATE TRIGGER test_reject_student_type BEFORE UPDATE OF type ON public.organization_members
      FOR EACH ROW EXECUTE FUNCTION public.test_reject_student_type();`);
      await asRole("authenticated", adminA);
      await blocked(
        saveStudentSql,
        [
          orgA,
          JSON.stringify({
            ...studentValues,
            type: "ADULT",
            state: "GRADUATE",
            lifecycle_confirmation: (
              await db.query(
                "SELECT get_student_change_impact($1,$2,'GRADUATE',NULL) impact",
                [orgA, studentA],
              )
            ).rows[0].impact.token,
          }),
          studentA,
        ],
        /test_membership_failure/,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT name,phone FROM profiles WHERE profile_id=$1",
            [studentA],
          )
        ).rows,
        [{ name: "Before", phone: "01011110000" }],
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT state,student_phone FROM organization_members WHERE profile_id=$1",
            [studentA],
          )
        ).rows,
        [{ state: "NORMAL", student_phone: "01011110000" }],
      );
    },
  );

  await check(
    "duplicate updates are atomic and include graduated and deleted students",
    async () => {
      await asRole("authenticated", adminA);
      const id = (
        await db.query(saveStudentSql, [
          orgA,
          JSON.stringify(studentValues),
          null,
        ])
      ).rows[0].profile_id;
      await db.query(
        "UPDATE organization_members SET state='DELETED' WHERE profile_id=$1",
        [id],
      );
      const before = (
        await db.query("SELECT name,phone FROM profiles WHERE profile_id=$1", [
          studentA,
        ])
      ).rows;
      await blocked(
        saveStudentSql,
        [
          orgA,
          JSON.stringify({ ...studentValues, phone: "01055551234" }),
          studentA,
        ],
        /organization_student_phone_unique/,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT name,phone FROM profiles WHERE profile_id=$1",
            [studentA],
          )
        ).rows,
        before,
      );
    },
  );

  await check(
    "phone key cannot be forged and follows direct profile edits and N:N memberships",
    async () => {
      await db.query(
        "UPDATE profiles SET phone='010-7777-0000' WHERE profile_id=$1",
        [studentA],
      );
      await db.query(
        "INSERT INTO organization_members (organization_id,profile_id,role) VALUES ($1,$2,'STUDENT')",
        [orgB, studentA],
      );
      await asRole("authenticated", adminA);
      await db.query(
        "UPDATE organization_members SET student_phone='fake' WHERE profile_id=$1 AND organization_id=$2",
        [studentA, orgA],
      );
      assert.equal(
        (
          await db.query(
            "SELECT student_phone FROM organization_members WHERE profile_id=$1 AND organization_id=$2",
            [studentA, orgA],
          )
        ).rows[0].student_phone,
        "01077770000",
      );
      await asRole("authenticated", studentA);
      await blocked(
        "UPDATE profiles SET phone='010-8888-0000' WHERE profile_id=$1",
        [studentA],
        /profile_management_update_not_allowed/,
      );
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET phone='010-8888-0000' WHERE profile_id=$1",
        [studentA],
      );
      await asRole("postgres");
      assert.deepEqual(
        (
          await db.query(
            "SELECT student_phone FROM organization_members WHERE profile_id=$1 ORDER BY organization_id",
            [studentA],
          )
        ).rows,
        [{ student_phone: "01088880000" }, { student_phone: "01088880000" }],
      );
      await asRole("authenticated", adminB);
      await blocked(
        saveStudentSql,
        [
          orgB,
          JSON.stringify({ ...studentValues, phone: "01088880000" }),
          null,
        ],
        /organization_student_phone_unique/,
      );
    },
  );

  await check(
    "same phone is allowed in different organizations and RPC ignores forged identity fields",
    async () => {
      await asRole("authenticated", adminA);
      const a = (
        await db.query(saveStudentSql, [
          orgA,
          JSON.stringify({
            ...studentValues,
            auth_user_id: adminB,
            role: "ADMIN",
            profile_id: adminA,
            organization_id: orgB,
          }),
          null,
        ])
      ).rows[0].profile_id;
      await asRole("authenticated", adminB);
      const b = (
        await db.query(saveStudentSql, [
          orgB,
          JSON.stringify(studentValues),
          null,
        ])
      ).rows[0].profile_id;
      assert.notEqual(a, b);
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT role FROM organization_members WHERE profile_id=$1",
            [a],
          )
        ).rows[0].role,
        "STUDENT",
      );
      assert.equal(
        (
          await db.query(
            "SELECT auth_user_id FROM profiles WHERE profile_id=$1",
            [a],
          )
        ).rows[0].auth_user_id,
        null,
      );
    },
  );

  await check(
    "self profile updates cannot alter course dates or management metadata",
    async () => {
      await asRole("authenticated", studentA);
      for (const mutation of [
        "class_end_date='2099-12-31'",
        "class_start_date='2020-01-01'",
        "region='forged'",
        "contact_email='forged@example.test'",
      ]) {
        await blocked(
          `UPDATE profiles SET ${mutation} WHERE profile_id=$1`,
          [studentA],
          /profile_management_update_not_allowed/,
        );
      }
      const result = await db.query(
        "UPDATE profiles SET name='Allowed name',marketing_consent=true WHERE profile_id=$1 RETURNING name",
        [studentA],
      );
      assert.equal(result.rows[0].name, "Allowed name");
      await asRole("authenticated", adminA);
      await db.query(
        "UPDATE profiles SET class_end_date='2099-12-31' WHERE profile_id=$1",
        [studentA],
      );
    },
  );

  const nextBooking = async () =>
    (
      await db.query(
        `SELECT ((now() AT TIME ZONE 'Asia/Seoul')::date + 1 + time '09:00') AT TIME ZONE 'Asia/Seoul' AS start`,
      )
    ).rows[0].start;
  const bookSql =
    "SELECT book_student_schedule($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours') AS id";
  await check(
    "student booking RPC enforces identity, date window, time and tenant",
    async () => {
      const start = await nextBooking();
      await asRole("anon");
      await blocked(bookSql, [orgA, null, start], /permission denied/);
      await asRole("authenticated", studentA);
      await blocked(bookSql, [orgB, null, start], /schedule_not_authorized/);
      await blocked(bookSql, [orgA, 2, start], /schedule_program_not_eligible/);
      await blocked(
        bookSql,
        [orgA, null, "2020-01-01T00:00:00Z"],
        /schedule_date_not_allowed/,
      );
      await blocked(
        bookSql,
        [orgA, null, "2099-01-01T00:00:00Z"],
        /schedule_date_not_allowed/,
      );
      await blocked(
        "SELECT book_student_schedule($1,null,$2::timestamptz,$2::timestamptz+interval '1 hour')",
        [orgA, start],
        /schedule_time_not_allowed/,
      );
      await blocked(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours')",
        [orgA, studentA, start],
        /row-level security/,
      );
      const result = await db.query(bookSql, [orgA, 1, start]);
      assert.ok(result.rows[0].id);
      await blocked(bookSql, [orgA, 1, start], /schedule_student_conflict/);
    },
  );
  await check(
    "course dates, membership state and atomic capacity apply in the database",
    async () => {
      const start = await nextBooking();
      await db.query(
        "UPDATE profiles SET class_end_date='2020-01-01' WHERE profile_id=$1",
        [studentA],
      );
      await asRole("authenticated", studentA);
      await blocked(bookSql, [orgA, null, start], /schedule_outside_course/);
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_end_date=null WHERE profile_id=$1",
        [studentA],
      );
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      );
      await asRole("authenticated", studentA);
      await blocked(bookSql, [orgA, null, start], /schedule_not_authorized/);
      await asRole("postgres");
      await db.query(
        "UPDATE organization_members SET state='NORMAL' WHERE organization_id=$1 AND profile_id=$2",
        [orgA, studentA],
      );
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES ($1,'max_concurrent_students','{\"value\":1}') ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA],
      );
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours')",
        [orgA, managedStudent, start],
      );
      await asRole("authenticated", studentA);
      await blocked(bookSql, [orgA, null, start], /schedule_capacity_exceeded/);
      await asRole("authenticated", adminA);
      await blocked(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours')",
        [orgA, studentA, start],
        /schedule_capacity_exceeded/,
      );
    },
  );
  await check(
    "catalog uploads require a trusted server and buckets allow only raster MIME types",
    async () => {
      await asRole("service_role");
      await db.query(
        "INSERT INTO storage.objects(name,bucket_id) VALUES ('existing.png','coverimages')",
      );
      for (const caller of [studentA, adminA]) {
        await asRole("authenticated", caller);
        for (const bucket of ["coverimages", "instructors"])
          await blocked(
            "INSERT INTO storage.objects(name,bucket_id) VALUES ('new.png',$1)",
            [bucket],
            /row-level security/,
          );
        assert.equal(
          (
            await db.query(
              "UPDATE storage.objects SET name='replaced.png' WHERE name='existing.png' RETURNING name",
            )
          ).rows.length,
          0,
        );
      }
      await asRole("postgres");
      for (const row of (
        await db.query("SELECT allowed_mime_types FROM storage.buckets")
      ).rows)
        assert.deepEqual(row.allowed_mime_types, [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
        ]);
    },
  );

  await check(
    "completed-hour aggregates exclude an ongoing class and retain tenant RLS",
    async () => {
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,now()-interval '1 hour',now()+interval '2 hours')",
        [orgA, studentA],
      );
      await asRole("authenticated", adminA);
      const attendanceRows = (
        await db.query(
          "SELECT schedule_id,attendance_version FROM schedules WHERE organization_id=$1 AND student_id=$2",
          [orgA, studentA],
        )
      ).rows;
      await db.query("SELECT save_attendance($1,$2)", [
        orgA,
        JSON.stringify(
          attendanceRows.map((s) => ({
            schedule_id: s.schedule_id,
            version: s.attendance_version,
            status: "PRESENT",
          })),
        ),
      ]);
      await asRole("authenticated", studentA);
      for (const fn of [
        "get_student_completed_hours",
        "get_student_total_hours",
      ]) {
        const result = await db.query(`SELECT * FROM ${fn}($1)`, [
          [studentA, studentB],
        ]);
        assert.deepEqual(result.rows, [
          { student_id: studentA, total_hours: 1 },
        ]);
      }
      await asRole("anon");
      await blocked(
        "SELECT * FROM get_student_completed_hours($1)",
        [[studentA]],
        /permission denied/,
      );
    },
  );

  await check(
    "booking availability exposes only flags and matches conflict, capacity and course guards",
    async () => {
      const start = await nextBooking();
      const day = (
        await db.query(
          "SELECT to_char($1::timestamptz AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day",
          [start],
        )
      ).rows[0].day;
      const sql =
        "SELECT * FROM get_student_booking_availability($1,$2::date,$3)";
      await asRole("anon");
      await blocked(sql, [orgA, day, 3], /permission denied/);
      await asRole("authenticated", studentA);
      await blocked(sql, [orgB, day, 3], /schedule_not_authorized/);
      await blocked(sql, [orgA, day, 4], /schedule_date_not_allowed/);
      await blocked(sql, [orgA, "2099-01-01", 3], /schedule_date_not_allowed/);
      let result = await db.query(sql, [orgA, day, 3]);
      assert.equal(result.rows.length, 23);
      assert.deepEqual(Object.keys(result.rows[0]).sort(), [
        "available",
        "reason",
        "start_time",
      ]);
      assert.ok(result.rows.every((row) => row.available));
      await db.query(bookSql, [orgA, 1, start]);
      result = await db.query(sql, [orgA, day, 3]);
      assert.equal(result.rows[0].reason, "student_conflict");
      assert.equal(result.rows[6].available, true); // back-to-back 12:00 is allowed
      await asRole("postgres");
      await db.query(
        "DELETE FROM schedules WHERE student_id=$1 AND start_time=$2",
        [studentA, start],
      );
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES ($1,'max_concurrent_students','{\"value\":1}') ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA],
      );
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours')",
        [orgA, managedStudent, start],
      );
      await asRole("authenticated", studentA);
      result = await db.query(sql, [orgA, day, 3]);
      assert.equal(result.rows[0].reason, "capacity");
      await asRole("postgres");
      await db.query(
        "UPDATE profiles SET class_end_date='2020-01-01' WHERE profile_id=$1",
        [studentA],
      );
      await asRole("authenticated", studentA);
      assert.ok(
        (await db.query(sql, [orgA, day, 3])).rows.every(
          (row) => row.reason === "outside_course",
        ),
      );
      await asRole("postgres");
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE profile_id=$1",
        [studentA],
      );
      await asRole("authenticated", studentA);
      await blocked(sql, [orgA, day, 3], /schedule_not_authorized/);
    },
  );

  await check(
    "disabled start times are tenant-scoped, student-only, and preserve existing schedules",
    async () => {
      const start = await nextBooking();
      const day = (
        await db.query(
          "SELECT to_char($1::timestamptz AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day",
          [start],
        )
      ).rows[0].day;
      // An existing reservation survives closing that start time.
      await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours')",
        [orgA, managedStudent, start],
      );
      await asRole("authenticated", adminA);
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES ($1,'disabled_booking_start_times',$2::jsonb) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA, JSON.stringify({ value: ["09:00", "20:00"] })],
      );
      await asRole("authenticated", studentA);
      const setting = await db.query(
        "SELECT organization_id FROM settings WHERE setting_key='disabled_booking_start_times'",
      );
      assert.deepEqual(
        setting.rows.map((row) => row.organization_id),
        [orgA],
      );
      assert.equal(
        (
          await db.query("SELECT * FROM schedules WHERE student_id=$1", [
            managedStudent,
          ])
        ).rows.length,
        0,
      ); // other student's data remains private
      assert.equal(
        (
          await db.query(
            "UPDATE settings SET setting_value='{}' WHERE setting_key='disabled_booking_start_times' RETURNING *",
          )
        ).rows.length,
        0,
      );
      await blocked(bookSql, [orgA, 1, start], /schedule_time_disabled/);
      const sql =
        "SELECT * FROM get_student_booking_availability($1,$2::date,$3)";
      for (const hours of [3, 6, 9]) {
        const slots = (await db.query(sql, [orgA, day, hours])).rows;
        assert.equal(slots[0].reason, "disabled");
        assert.equal(slots.at(-1).reason, "disabled");
        assert.equal(slots[1].available, true); // only starting at 09:00 is closed
      }
      await asRole("authenticated", studentB);
      assert.equal(
        (await db.query(sql, [orgB, day, 3])).rows[0].available,
        true,
      );
      await asRole("authenticated", adminA);
      const inserted = await db.query(
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours') RETURNING schedule_id",
        [orgA, studentA, start],
      );
      assert.ok(inserted.rows[0].schedule_id);
      await db.query(
        "UPDATE schedules SET start_time=start_time+interval '1 day',end_time=end_time+interval '1 day' WHERE schedule_id=$1",
        [inserted.rows[0].schedule_id],
      );
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT * FROM schedules WHERE student_id=$1 AND start_time=$2",
            [managedStudent, start],
          )
        ).rows.length,
        1,
      );
      await db.query(
        "UPDATE settings SET setting_value=$2::jsonb WHERE organization_id=$1 AND setting_key='disabled_booking_start_times'",
        [orgA, JSON.stringify({ value: [] })],
      );
      await asRole("authenticated", studentA);
      assert.ok((await db.query(bookSql, [orgA, 1, start])).rows[0].id);
    },
  );

  await check(
    "closed weekdays block student RPC and direct writes in KST, isolate tenants, and preserve existing/admin schedules",
    async () => {
      const start = await nextBooking();
      const { day, dow, next_day } = (
        await db.query(
          "SELECT to_char($1::timestamptz AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day, extract(dow FROM $1::timestamptz AT TIME ZONE 'Asia/Seoul')::integer AS dow, to_char(($1::timestamptz AT TIME ZONE 'Asia/Seoul') + interval '1 day','YYYY-MM-DD') AS next_day",
          [start],
        )
      ).rows[0];
      const insertSql =
        "INSERT INTO schedules(organization_id,student_id,start_time,end_time) VALUES ($1,$2,$3::timestamptz,$3::timestamptz+interval '3 hours') RETURNING schedule_id";
      const existingId = (
        await db.query(insertSql, [orgA, managedStudent, start])
      ).rows[0].schedule_id;
      await asRole("authenticated", adminA);
      await db.query(
        "INSERT INTO settings(organization_id,setting_key,setting_value) VALUES ($1,'disabled_booking_weekdays',$2::jsonb) ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value",
        [orgA, JSON.stringify({ value: [dow] })],
      );
      await asRole("authenticated", studentA);
      assert.deepEqual(
        (
          await db.query(
            "SELECT organization_id,setting_value FROM settings WHERE setting_key='disabled_booking_weekdays'",
          )
        ).rows,
        [{ organization_id: orgA, setting_value: { value: [dow] } }],
      );
      assert.equal(
        (
          await db.query(
            "UPDATE settings SET setting_value='{\"value\":[]}' WHERE setting_key='disabled_booking_weekdays' RETURNING *",
          )
        ).rows.length,
        0,
      );
      await blocked(bookSql, [orgA, 1, start], /schedule_day_disabled/);
      await blocked(
        insertSql,
        [orgA, studentA, start],
        /schedule_day_disabled/,
      );
      const availabilitySql =
        "SELECT * FROM get_student_booking_availability($1,$2::date,$3)";
      for (const hours of [3, 6, 9]) {
        const slots = (await db.query(availabilitySql, [orgA, day, hours]))
          .rows;
        assert.equal(slots.length, 23);
        assert.ok(
          slots.every(
            (slot) => !slot.available && slot.reason === "day_disabled",
          ),
        );
      }
      assert.equal(
        (await db.query(availabilitySql, [orgA, next_day, 3])).rows[0]
          .available,
        true,
      );
      await asRole("authenticated", studentB);
      assert.equal(
        (
          await db.query(
            "SELECT * FROM settings WHERE setting_key='disabled_booking_weekdays'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await db.query(availabilitySql, [orgB, day, 3])).rows[0].available,
        true,
      );
      await asRole("authenticated", adminB);
      assert.equal(
        (
          await db.query(
            "UPDATE settings SET setting_value='{\"value\":[]}' WHERE organization_id=$1 AND setting_key='disabled_booking_weekdays' RETURNING *",
            [orgA],
          )
        ).rows.length,
        0,
      );
      await asRole("authenticated", adminA);
      const adminId = (await db.query(insertSql, [orgA, studentA, start]))
        .rows[0].schedule_id;
      await db.query(
        "UPDATE schedules SET start_time=start_time+interval '1 day',end_time=end_time+interval '1 day' WHERE schedule_id=$1",
        [adminId],
      );
      await db.query(
        "UPDATE settings SET setting_value='{\"value\":[]}' WHERE organization_id=$1 AND setting_key='disabled_booking_weekdays'",
        [orgA],
      );
      await asRole("authenticated", studentA);
      assert.ok((await db.query(bookSql, [orgA, 1, start])).rows[0].id);
      await asRole("postgres");
      assert.equal(
        (
          await db.query(
            "SELECT * FROM schedules WHERE schedule_id=$1 AND cancelled_at IS NULL",
            [existingId],
          )
        ).rows.length,
        1,
      );
    },
  );

  await check(
    "student class and instructor history stay within their tenant and own schedules",
    async () => {
      await db.query("UPDATE programs SET instructor_id=1 WHERE program_id=1");
      await asRole("authenticated", studentA);
      const instructors = await db.query("SELECT name FROM instructors");
      assert.deepEqual(instructors.rows, [{ name: "Instructor A" }]);
      await asRole("postgres");
      await db.query(
        "UPDATE programs SET status='ARCHIVED' WHERE program_id=1",
      );
      await asRole("authenticated", studentA);
      assert.deepEqual((await db.query("SELECT name FROM instructors")).rows, [
        { name: "Instructor A" },
      ]);
      assert.deepEqual(
        (await db.query("SELECT title FROM programs WHERE status='ARCHIVED'"))
          .rows,
        [{ title: "Program A" }],
      );
      await asRole("authenticated", studentB);
      assert.equal(
        (await db.query("SELECT name FROM instructors")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("SELECT title FROM programs WHERE status='ARCHIVED'"))
          .rows.length,
        0,
      );
    },
  );

  const pushDeviceA = "20000000-0000-0000-0000-000000000001";
  const pushDeviceB = "20000000-0000-0000-0000-000000000002";
  const browserSubscription = (suffix = "a") => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
    keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
  });
  async function seedPush() {
    await db.query(
      "UPDATE instructors SET push_profile_id=$1 WHERE instructor_id=1",
      [adminA],
    );
    await db.exec("UPDATE programs SET instructor_id=1 WHERE program_id=1");
    await pushStore.savePushSubscription(
      orgA,
      adminA,
      pushDeviceA,
      browserSubscription(),
    );
    await pushStore.savePushSubscription(
      orgA,
      adminA,
      pushDeviceB,
      browserSubscription("b"),
    );
    await pushStore.savePushSubscription(
      orgB,
      adminB,
      "20000000-0000-0000-0000-000000000003",
      browserSubscription("foreign"),
    );
  }
  async function bookWithPush() {
    await asRole("authenticated", studentA);
    const id = (await db.query(bookSql, [orgA, 1, await nextBooking()])).rows[0]
      .id;
    await asRole("postgres");
    return Number(id);
  }

  await check(
    "Web Push records student booking and cancellation atomically without AlimTalk/email templates",
    async () => {
      await seedPush();
      const id = await bookWithPush();
      const events = (await db.query("SELECT * FROM push_events")).rows;
      assert.equal(events.length, 1);
      assert.equal(events[0].recipient_profile_id, adminA);
      assert.equal(events[0].actor_profile_id, studentA);
      assert.equal(events[0].event_type, "BOOKED");
      assert.equal(
        (await db.query("SELECT * FROM push_deliveries")).rows.length,
        2,
      );
      await asRole("authenticated", studentA);
      await blocked(
        "SELECT endpoint FROM push_subscriptions",
        [],
        /permission denied/,
      );
      await blocked(
        "UPDATE push_events SET recipient_profile_id=$1",
        [studentA],
        /permission denied/,
      );
      await db.query("DELETE FROM schedules WHERE schedule_id=$1", [id]);
      await asRole("postgres");
      assert.equal(
        (await db.query("SELECT * FROM schedules WHERE schedule_id=$1", [id]))
          .rows.length,
        0,
      );
      const cancel = (
        await db.query("SELECT * FROM push_events WHERE event_type='CANCELLED'")
      ).rows[0];
      assert.equal(cancel.recipient_profile_id, adminA);
      assert.match(cancel.body, /Program A.*취소/);
      assert.equal(
        (await db.query("SELECT * FROM push_deliveries")).rows.length,
        4,
      );
      assert.equal(
        (
          await db.query("SELECT * FROM notifications WHERE schedule_id=$1", [
            id,
          ])
        ).rows.length,
        0,
      );
      // Uncommitted schedule and outbox changes roll back together.
      await db.exec("SAVEPOINT push_rollback");
      await bookWithPush();
      await db.exec("ROLLBACK TO SAVEPOINT push_rollback");
      assert.equal(
        (await db.query("SELECT * FROM push_events")).rows.length,
        2,
      );
    },
  );

  await check(
    "Web Push rejects foreign/student instructor accounts and ignores admin or unassigned changes",
    async () => {
      await blocked(
        "UPDATE instructors SET push_profile_id=$1 WHERE instructor_id=1",
        [adminB],
        /instructor_push_account_not_eligible/,
      );
      await blocked(
        "UPDATE instructors SET push_profile_id=$1 WHERE instructor_id=1",
        [studentA],
        /instructor_push_account_not_eligible/,
      );
      await seedPush();
      await asRole("authenticated", adminA);
      const start = await nextBooking();
      const adminSchedule = (
        await db.query(
          `INSERT INTO schedules(organization_id,student_id,program_id,start_time,end_time)
      VALUES($1,$2,1,$3,$3::timestamptz+interval '3 hours') RETURNING schedule_id`,
          [orgA, studentA, start],
        )
      ).rows[0];
      await db.query("DELETE FROM schedules WHERE schedule_id=$1", [
        adminSchedule.schedule_id,
      ]);
      await asRole("postgres");
      assert.equal(
        (await db.query("SELECT * FROM push_events")).rows.length,
        0,
      );
      await db.exec(
        "UPDATE programs SET instructor_id=NULL WHERE program_id=1",
      );
      await bookWithPush();
      assert.equal(
        (await db.query("SELECT * FROM push_events")).rows.length,
        0,
      );
      await asRole("anon");
      await blocked(
        "SELECT * FROM push_subscriptions",
        [],
        /permission denied/,
      );
      await blocked(
        "INSERT INTO push_deliveries DEFAULT VALUES",
        [],
        /permission denied/,
      );
    },
  );

  await check(
    "Web Push claims do not overlap, retry with leases, and preserve per-device sent state",
    async () => {
      await seedPush();
      const scheduleId = await bookWithPush();
      assert.equal(
        (
          await pushStore.claimPushDeliveries({
            scheduleId,
            actorProfileId: studentB,
          })
        ).length,
        0,
      );
      const claimed = await pushStore.claimPushDeliveries({
        scheduleId,
        actorProfileId: studentA,
      });
      assert.equal(claimed.length, 2);
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      await pushStore.finishPushDelivery(
        { ...claimed[0], claim_token: "90000000-0000-0000-0000-000000000001" },
        "SENT",
      );
      assert.equal(
        (
          await db.query(
            "SELECT status FROM push_deliveries WHERE delivery_id=$1",
            [claimed[0].delivery_id],
          )
        ).rows[0].status,
        "SENDING",
      );
      await pushStore.finishPushDelivery(claimed[0], "SENT");
      await pushStore.finishPushDelivery(
        claimed[1],
        "PENDING",
        "push_http_503",
      );
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      await db.exec(
        "UPDATE push_deliveries SET next_attempt_at=now()-interval '1 second' WHERE status='PENDING'",
      );
      const retry = await pushStore.claimPushDeliveries();
      assert.equal(retry.length, 1);
      assert.equal(retry[0].attempts, 2);
      await db.exec(
        "UPDATE push_deliveries SET locked_until=now()-interval '1 second' WHERE status='SENDING'",
      );
      const recovered = await pushStore.claimPushDeliveries();
      assert.equal(recovered[0].attempts, 3);
      assert.notEqual(recovered[0].claim_token, retry[0].claim_token);
      await pushStore.finishPushDelivery(retry[0], "FAILED");
      assert.equal(
        (
          await db.query(
            "SELECT status FROM push_deliveries WHERE delivery_id=$1",
            [recovered[0].delivery_id],
          )
        ).rows[0].status,
        "SENDING",
      );
      await db.exec(
        "UPDATE push_deliveries SET attempts=5,locked_until=now()-interval '1 second' WHERE status='SENDING'",
      );
      await pushStore.maintainPushQueue();
      assert.equal((await pushStore.claimPushDeliveries()).length, 0);
      assert.deepEqual(
        (
          await db.query("SELECT status FROM push_deliveries ORDER BY status")
        ).rows.map((row) => row.status),
        ["FAILED", "SENT"],
      );
    },
  );

  await check(
    "Web Push rechecks account state, instructor reassignment, expiry and device account switches before sending",
    async () => {
      await seedPush();
      await bookWithPush();
      const [claim] = await pushStore.claimPushDeliveries();
      const target = () =>
        pushStore.getPushDeliveryTarget(claim.delivery_id, claim.claim_token);
      assert.equal((await target()).eligible, true);
      await db.query(
        "UPDATE organization_members SET state='GRADUATE' WHERE profile_id=$1 AND organization_id=$2",
        [adminA, orgA],
      );
      assert.equal((await target()).eligible, false);
      await db.query(
        "UPDATE organization_members SET state='NORMAL' WHERE profile_id=$1 AND organization_id=$2",
        [adminA, orgA],
      );
      await db.query(
        "UPDATE instructors SET push_profile_id=NULL WHERE instructor_id=1",
      );
      assert.ok(!(await target()).eligible);
      await db.query(
        "UPDATE instructors SET push_profile_id=$1 WHERE instructor_id=1",
        [adminA],
      );
      await db.exec(
        "UPDATE push_subscriptions SET expires_at=now()-interval '1 second'",
      );
      assert.equal((await target()).eligible, false);
      await db.exec("UPDATE push_subscriptions SET expires_at=NULL");
      const sub = (
        await db.query(
          "SELECT * FROM push_subscriptions WHERE subscription_id=$1",
          [(await target()).subscription_id],
        )
      ).rows[0];
      await pushStore.savePushSubscription(orgB, adminB, sub.device_id, {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      });
      assert.equal((await target()).eligible, false);
      await pushStore.removePushDevice(sub.device_id);
      assert.equal(await target(), null);
    },
  );

  await check(
    "Web Push session reconciliation keeps the current account and detaches only the switched device",
    async () => {
      await seedPush();
      await pushStore.removeStalePushDevice(pushDeviceA, adminA);
      assert.equal(
        await pushStore.hasPushSubscription(orgA, adminA, pushDeviceA),
        true,
      );
      await pushStore.removeStalePushDevice(pushDeviceA, adminB);
      assert.equal(
        await pushStore.hasPushSubscription(orgA, adminA, pushDeviceA),
        false,
      );
      assert.equal(
        await pushStore.hasPushSubscription(orgA, adminA, pushDeviceB),
        true,
      );
      await pushStore.removeStalePushDevice(pushDeviceB, null);
      assert.equal(
        await pushStore.hasPushSubscription(orgA, adminA, pushDeviceB),
        false,
      );
    },
  );

  await checkStudentMetadata({
    db,
    check,
    asRole,
    blocked,
    orgA,
    orgB,
    adminA,
    studentA,
  });
  await checkStudentTypes({
    db,
    check,
    asRole,
    blocked,
    orgA,
    orgB,
    adminA,
    adminB,
    studentA,
  });
  await checkBookingPolicy({
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
  });
  await checkBookingWindow({
    db,
    check,
    asRole,
    blocked,
    orgA,
    orgB,
    adminA,
    studentA,
  });
  await checkCancellationPolicy({
    db,
    check,
    asRole,
    blocked,
    orgA,
    orgB,
    adminA,
    studentA,
    studentB,
  });
  await checkAttendance({
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
  });
  await checkStudentLifecyclePerformance({
    db,
    check,
    asRole,
    baseline: lifecycleBaseline,
    orgA,
    adminA,
    studentA,
  });
  await checkStudentLifecycle({
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
    studentEditBaseline,
  });

  await checkClassBookingPolicy({
    db,
    check,
    asRole,
    blocked,
    attendancePatch: await readFile(
      new URL("0037_preserve_existing_class_attendance.sql", migrationRoot),
      "utf8",
    ),
    source: await readFile(
      new URL("0036_class_booking_policy.sql", migrationRoot),
      "utf8",
    ),
    orgA,
    orgB,
    adminA,
    studentA,
    managedStudent,
  });

  await checkSettingsSections({
    db,
    check,
    asRole,
    blocked,
    source: await readFile(
      new URL("0038_settings_section_saves.sql", migrationRoot),
      "utf8",
    ),
    orgA,
    orgB,
    adminA,
    studentA,
  });

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
