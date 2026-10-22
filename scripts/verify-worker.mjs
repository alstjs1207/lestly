// Verify the exact deployment environment's worker credentials without sending
// a message or exporting credentials to another control plane.
import assert from "node:assert/strict";

if (!process.env.VERCEL && !process.argv.includes("--live")) {
  console.log(
    "Worker deployment check runs on Vercel (or with explicit --live).",
  );
  process.exit(0);
}
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } =
  process.env;
assert.equal(
  new URL(SUPABASE_URL).hostname,
  "smbpzlzbvplhtpqggrjf.supabase.co",
);
assert.ok(
  SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY,
  "Worker credentials missing",
);
for (const [name, key, status] of [
  ["public", SUPABASE_ANON_KEY, 401],
  ["server", SUPABASE_SERVICE_ROLE_KEY, 400],
]) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-alimtalk`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notification_id: 0 }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, status, `${name} worker authentication failed`);
  const payload = await response.json();
  assert.equal(
    payload.error,
    name === "public" ? "Unauthorized" : "notification_id is required",
  );
  console.log(
    `Worker ${name} credential check: ${response.status} (no delivery)`,
  );
}
