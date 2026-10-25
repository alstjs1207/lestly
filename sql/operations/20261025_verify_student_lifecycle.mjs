import dotenv from "dotenv";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";

const env = dotenv.parse(
  await fs.readFile(new URL("../../.env", import.meta.url)),
);
const sql = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  onnotice() {},
});
try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL statement_timeout='15s'`;
    const rows =
      await q`SELECT DISTINCT ON(m.role,m.state) m.role,m.state,p.auth_user_id FROM organization_members m JOIN profiles p USING(profile_id) WHERE p.auth_user_id IS NOT NULL AND m.state IN ('NORMAL','GRADUATE') ORDER BY m.role,m.state,p.profile_id`;
    const checks = [];
    for (const row of rows) {
      await q`SET LOCAL ROLE authenticated`;
      await q`SELECT set_config('request.jwt.claim.sub',${row.auth_user_id},true)`;
      await q`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: row.auth_user_id, iat: Math.floor(Date.now() / 1000), app_metadata: {} })},true)`;
      const [r] =
        await q`SELECT (get_account_auth_context()->>'allowed')::boolean allowed,(SELECT count(*)::int FROM profiles) readable_profiles,(SELECT count(*)::int FROM schedules) readable_schedules,(SELECT count(*)::int FROM programs) readable_programs`;
      assert.equal(r.allowed, true);
      assert.ok(r.readable_profiles >= 1);
      if (row.state === "GRADUATE")
        assert.equal(
          (
            await q`SELECT count(*)::int n FROM schedules WHERE end_time>now()`
          )[0].n,
          0,
        );
      checks.push({ role: row.role, state: row.state, ...r });
      await q`RESET ROLE`;
    }
    const testAccount = (
      await q`SELECT EXISTS(SELECT 1 FROM auth.users u JOIN profiles p ON p.auth_user_id=u.id JOIN organization_members m USING(profile_id) WHERE u.email=${env.ADMIN_TEST_EMAIL} AND m.role='ADMIN' AND m.state='NORMAL' AND p.is_signup_complete) usable`
    )[0].usable;
    return {
      at: new Date().toISOString(),
      readOnly: true,
      roleChecks: checks,
      configuredAdminTestAccountUsable: testAccount,
    };
  });
  const left = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    onnotice() {},
  });
  const right = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 1,
    connect_timeout: 10,
    onnotice() {},
  });
  try {
    await left`BEGIN READ ONLY`;
    await right`BEGIN READ ONLY`;
    const key = "schedule-org:00000000-0000-0000-0000-00000000f105";
    await left`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
    assert.equal(
      (
        await right`SELECT pg_try_advisory_xact_lock(hashtextextended(${key},0)) acquired`
      )[0].acquired,
      false,
    );
    await left`ROLLBACK`;
    assert.equal(
      (
        await right`SELECT pg_try_advisory_xact_lock(hashtextextended(${key},0)) acquired`
      )[0].acquired,
      true,
    );
    await right`ROLLBACK`;
    result.twoConnectionAdvisoryLockVerified = true;
  } finally {
    await Promise.allSettled([left`ROLLBACK`, right`ROLLBACK`]);
    await Promise.all([left.end({ timeout: 5 }), right.end({ timeout: 5 })]);
  }
  await fs.writeFile(
    new URL("20261025_student_lifecycle_verify.result.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ code: e.code, message: e.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
