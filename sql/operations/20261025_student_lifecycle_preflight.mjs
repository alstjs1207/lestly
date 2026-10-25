import dotenv from "dotenv";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";

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
  connect_timeout: 10,
  onnotice() {},
});
try {
  const result = await sql.begin(async (q) => {
    await q`SET TRANSACTION READ ONLY`;
    await q`SET LOCAL statement_timeout='15s'`;
    const states =
      await q`SELECT m.state,count(*)::int memberships,count(p.auth_user_id)::int linked_accounts FROM organization_members m JOIN profiles p USING(profile_id) WHERE m.role='STUDENT' GROUP BY m.state ORDER BY m.state`;
    const sessions =
      await q`SELECT count(*)::int withdrawn_sessions FROM auth.sessions s WHERE EXISTS(SELECT 1 FROM profiles p JOIN organization_members m USING(profile_id) WHERE p.auth_user_id=s.user_id AND m.role='STUDENT' AND m.state='DELETED')`;
    const inactiveReservations =
      await q`SELECT m.state,count(*)::int future_reservations FROM schedules s JOIN organization_members m ON m.organization_id=s.organization_id AND m.profile_id=s.student_id WHERE m.role='STUDENT' AND m.state<>'NORMAL' AND s.start_time>now() GROUP BY m.state`;
    const pending =
      await q`SELECT count(*)::int inactive_queued_notifications FROM notifications n JOIN organization_members m ON m.organization_id=n.organization_id AND m.profile_id=n.recipient_profile_id WHERE m.role='STUDENT' AND m.state<>'NORMAL' AND (n.alimtalk_status IN ('PENDING','SENDING') OR n.email_status='PENDING')`;
    const permissions =
      await q`SELECT has_table_privilege(current_user,'auth.sessions','DELETE') can_revoke_sessions,to_regprocedure('public.get_account_auth_context()') IS NOT NULL lifecycle_applied`;
    const ledger =
      await q`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3`;
    return {
      readOnly: true,
      project: "smbpzlzbvplhtpqggrjf",
      states,
      withdrawnSessions: sessions[0].withdrawn_sessions,
      inactiveReservations,
      inactiveQueuedNotifications: pending[0].inactive_queued_notifications,
      permissions: permissions[0],
      latestLedger: ledger,
    };
  });
  await fs.writeFile(
    new URL("../../.vercel/student-lifecycle-preflight.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(JSON.stringify({ code: e.code, message: e.message }));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
