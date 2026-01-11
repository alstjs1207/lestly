import * as Sentry from "@sentry/react-router";

if (process.env.SENTRY_DSN) {
  const { nodeProfilingIntegration } = await import("@sentry/profiling-node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
