import assert from "node:assert/strict";
import test from "node:test";
import { Resend } from "resend";

import { isWorkerAuthorized } from "../supabase/functions/_shared/worker-auth.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

type Route = { action(args: { request: Request }): Promise<unknown> };

test("real email cron isolates actual SDK idempotency headers from other notifications and contact mail", async () => {
  const sharedClient = new Resend("dummy-test-key");
  const pending = [1, 2].map((id) => ({
    notification_id: id,
    recipient_email: `student${id}@example.test`,
    alimtalk_template_code: "class",
    alimtalk_variables: { program_title: "Class" },
  }));
  const client = {
    from(table: string) {
      if (table === "notifications") {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          limit: async () => ({ data: pending, error: null }),
        };
        return {
          ...query,
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      assert.equal(table, "super_templates");
      return {
        select: () => ({
          in: async () => ({
            data: [
              {
                kakao_template_code: "class",
                type: "ADM_BOOK_STUDENT",
                content: "#{program_title}",
              },
            ],
            error: null,
          }),
        }),
      };
    },
  };
  const route = loadMockedModule<Route>(
    new URL(
      "../app/features/notifications/api/email-cron.tsx",
      import.meta.url,
    ),
    {
      "@sentry/node": { captureException() {} },
      "react-router": {
        data: (data: unknown, init?: unknown) => ({ data, init }),
      },
      resend: { Resend },
      "transactional-emails/emails/notification": { default: () => undefined },
      "~/core/lib/resend-client.server": { default: sharedClient },
      "~/core/lib/supa-admin-client.server": { default: client },
      "~/core/lib/worker-auth.server": { isWorkerAuthorized },
    },
    {
      process: {
        env: { CRON_SECRET: "cron-secret", RESEND_API_KEY: "dummy-test-key" },
      },
    },
  );

  const idempotencyKeys: Array<string | null> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    idempotencyKeys.push(new Headers(init?.headers).get("Idempotency-Key"));
    return new Response(
      JSON.stringify({ id: `email-${idempotencyKeys.length}` }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
  try {
    await route.action({
      request: new Request("https://lestly.test/email-cron", {
        method: "POST",
        headers: { Authorization: "cron-secret" },
      }),
    });
    await sharedClient.emails.send({
      from: "sender@example.test",
      to: "admin@example.test",
      subject: "Contact",
      text: "Unrelated message",
    });
    assert.deepEqual(idempotencyKeys, [
      "notification-email/1",
      "notification-email/2",
      null,
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
