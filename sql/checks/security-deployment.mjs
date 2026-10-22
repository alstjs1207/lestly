// Post-deployment policy verification; negative writes are always rolled back.
import dotenv from "dotenv";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import postgres from "postgres";

if (process.argv[2] !== "--live")
  throw new Error("Explicit --live flag required");
const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
assert.equal(
  new URL(env.SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  onnotice: () => {},
  connect_timeout: 10,
});
try {
  const result = await sql.begin(async (q) => {
    const policies =
      await q`select policyname from pg_policies where schemaname='public' and policyname in ('admin-insert-org-memberships-policy','student-insert-own-schedules-policy','anon_insert_consult_notifications')`;
    assert.equal(policies.length, 0);
    const constraints =
      await q`select conname,convalidated from pg_constraint where conname in ('programs_instructor_tenant_fk','schedules_program_tenant_fk','schedules_valid_time_range','notifications_program_tenant_fk','notifications_schedule_tenant_fk','notifications_parent_tenant_fk','in_app_notifications_notification_tenant_fk','student_invites_member_tenant_fk')`;
    assert.equal(constraints.length, 8);
    assert.ok(constraints.every((x) => x.convalidated));
    const grants = (
      await q`select has_table_privilege('anon','public.notifications','INSERT') as anon_consult_insert,has_function_privilege('anon','public.book_student_schedule(uuid,bigint,timestamptz,timestamptz)','EXECUTE') as anon_booking_rpc,has_function_privilege('authenticated','public.book_student_schedule(uuid,bigint,timestamptz,timestamptz)','EXECUTE') as student_booking_rpc`
    )[0];
    assert.deepEqual(grants, {
      anon_consult_insert: false,
      anon_booking_rpc: false,
      student_booking_rpc: true,
    });
    const storage =
      await q`select policyname from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('INSERT','UPDATE','DELETE','ALL') and (coalesce(qual,'')||coalesce(with_check,''))~'(coverimages|instructors)'`;
    assert.equal(storage.length, 0);
    const buckets =
      await q`select id,allowed_mime_types from storage.buckets where id in ('avatars','coverimages','instructors') order by id`;
    assert.equal(buckets.length, 3);
    for (const b of buckets)
      assert.deepEqual(b.allowed_mime_types, [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ]);
    const triggers =
      await q`select distinct tgname from pg_trigger where not tgisinternal and tgname in ('protect_profile_management_fields','protect_membership_identity','guard_schedule_write','check_schedule_student_membership')`;
    assert.equal(triggers.length, 4);
    const [student] =
      await q`select p.profile_id,p.auth_user_id,m.organization_id from profiles p join organization_members m using(profile_id) where p.auth_user_id is not null and m.role='STUDENT' and not exists(select 1 from organization_members a where a.profile_id=p.profile_id and a.role='ADMIN') limit 1`;
    assert.ok(
      student,
      "Linked student required for a negative authorization probe",
    );
    const probe = async (role, statement, params, expected) => {
      assert.match(role, /^(authenticated|anon)$/);
      await assert.rejects(
        q.savepoint(async (s) => {
          await s.unsafe(`SET LOCAL ROLE ${role}`);
          if (role === "authenticated") {
            await s`select set_config('request.jwt.claim.sub',${student.auth_user_id},true)`;
            await s`select set_config('request.jwt.claims',${JSON.stringify({ sub: student.auth_user_id, role: "authenticated" })},true)`;
          }
          await s.unsafe(statement, params);
          throw new Error("unexpectedly_permitted_security_probe");
        }),
        expected,
      );
    };
    await probe(
      "authenticated",
      "UPDATE public.profiles SET class_end_date=case when class_end_date=date '2099-12-30' then date '2099-12-31' else date '2099-12-30' end WHERE profile_id=$1",
      [student.profile_id],
      /profile_management_update_not_allowed/,
    );
    await probe(
      "authenticated",
      "INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES('coverimages',$1,$2)",
      [`__security_verification__/${randomUUID()}.png`, student.auth_user_id],
      /row-level security/,
    );
    await probe(
      "anon",
      "INSERT INTO public.notifications(organization_id,type,recipient_phone) VALUES($1,'CONSULT_REQUEST','01000000000')",
      [student.organization_id],
      /permission denied/,
    );
    const mimeGroups =
      await q`select bucket_id,metadata->>'mimetype' as mime,count(*)::int count from storage.objects where bucket_id in ('avatars','coverimages','instructors') group by bucket_id,metadata->>'mimetype' order by bucket_id,mime`;
    const counts = (
      await q`select (select count(*)::int from profiles) profiles,(select count(*)::int from organization_members) memberships,(select count(*)::int from schedules) schedules`
    )[0];
    assert.equal(
      (
        await q`select count(*)::int n from organizations where name='Security concurrency verification - temporary'`
      )[0].n,
      0,
    );
    return {
      at: new Date().toISOString(),
      unsafePoliciesRemaining: 0,
      validatedTenantConstraints: constraints.length,
      guardTriggers: triggers.length,
      grants,
      catalogWritePolicies: 0,
      buckets,
      studentCourseDateUpdateDenied: true,
      studentCatalogInsertDenied: true,
      anonConsultInsertDenied: true,
      securityProbeWritesRolledBack: true,
      temporaryOrganizationsRemaining: 0,
      storageMimeGroups: mimeGroups,
      counts,
    };
  });
  await fs.writeFile(
    new URL(
      "../operations/20261022_security_postflight.result.json",
      import.meta.url,
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(result);
} catch (e) {
  console.error({ code: e.code, message: e.message });
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
