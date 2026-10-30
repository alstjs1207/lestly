import { spawnSync } from "node:child_process";

// Keep this entry point credential-free. Do not add live workers or operations scripts.
const commands = [
  "verify:node",
  "spec:check",
  "test:spec-tools",
  "test:unit",
  "test:db",
  "typecheck",
  "build",
  "test:ssr",
];
for (const command of commands) {
  console.log(`\nChecking ${command}`);
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", command],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VERCEL: "",
        OPENSPEC_TELEMETRY: "0",
        SENTRY_AUTH_TOKEN: "",
        SENTRY_ORG: "",
        SENTRY_PROJECT: "",
        SENTRY_DSN: "",
        VITE_SENTRY_DSN: "",
        RESEND_API_KEY: "re_local_verification_placeholder",
        TOSS_PAYMENTS_SECRET_KEY: "",
        WEB_PUSH_VAPID_PUBLIC_KEY: "",
        WEB_PUSH_VAPID_PRIVATE_KEY: "",
        WEB_PUSH_VAPID_SUBJECT: "",
        CRON_SECRET: "local-verification-worker-placeholder",
        ADMIN_EMAIL: "local-verification@example.test",
        APP_URL: "https://lestly.test",
        SITE_URL: "https://lestly.test",
        VITE_APP_NAME: "Lestly",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "local-verification-anon-placeholder",
        SUPABASE_SERVICE_ROLE_KEY:
          "local-verification-service-role-placeholder",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "local-verification-anon-placeholder",
        DATABASE_URL:
          "postgres://local:local@127.0.0.1:1/local_verification_only",
        SESSION_SECRET: "local-verification-session-placeholder",
      },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
