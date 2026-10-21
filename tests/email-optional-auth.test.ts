import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { getSiteOrigin } from "../app/core/lib/site-origin.server.ts";
import { getSocialOAuthOptions } from "../app/features/auth/lib/social-oauth.ts";
import { loadMockedModule } from "./helpers/mocked-module.ts";

type Result = {
  data: { error?: string; success?: boolean };
  init?: { status?: number };
};
type Handler = {
  loader(args: {
    params?: Record<string, string>;
    request: Request;
  }): Promise<Response | Result>;
};
const router = {
  data: (data: unknown, init?: unknown) => ({ data, init }),
  redirect: (location: string, init?: ResponseInit) =>
    new Response(null, {
      ...init,
      status: 302,
      headers: { Location: location },
    }),
};

test("Kakao OAuth keeps preview callbacks on the cookie origin, omits email and preserves invitations", async () => {
  for (const environment of ["production", "preview"]) {
    for (const invite of [null, "one-time-token"]) {
      let captured: any;
      const route = loadMockedModule<Handler>(
        new URL(
          "../app/features/auth/screens/social/start.tsx",
          import.meta.url,
        ),
        {
          "react/jsx-runtime": {},
          "react-router": router,
          zod: { z },
          "~/core/lib/site-origin.server": { getSiteOrigin },
          "../../lib/social-oauth": { getSocialOAuthOptions },
          "~/core/lib/supa-client.server": {
            default: () => [
              {
                auth: {
                  signInWithOAuth: async (options: unknown) => {
                    captured = options;
                    return {
                      data: { url: "https://auth.example.test/authorize" },
                      error: null,
                    };
                  },
                },
              },
              new Headers(),
            ],
          },
        },
        {
          URL,
          process: {
            env: { SITE_URL: "https://lestly.test", VERCEL_ENV: environment },
          },
        },
      );
      const url = new URL(
        "https://preview.lestly.test/auth/social/start/kakao",
      );
      if (invite) url.searchParams.set("invite", invite);
      const result = await route.loader({
        params: { provider: "kakao" },
        request: new Request(url),
      });
      assert.equal((result as Response).status, 302);
      assert.equal(captured.provider, "kakao");
      assert.equal(captured.options.scopes, undefined);
      assert.equal(
        captured.options.queryParams.scope,
        "profile_nickname,profile_image",
      );
      const callback = new URL(captured.options.redirectTo);
      assert.equal(
        callback.origin,
        environment === "preview"
          ? "https://preview.lestly.test"
          : "https://lestly.test",
      );
      assert.equal(callback.pathname, "/auth/social/complete/kakao");
      assert.equal(callback.searchParams.get("invite"), invite);
    }
  }
});

test("site origin preserves development cookies and production canonical URL", () => {
  const request = new Request("http://localhost:5193/login");
  assert.equal(
    getSiteOrigin(request, {
      NODE_ENV: "development",
      SITE_URL: "https://lestly.test",
    }),
    "http://localhost:5193",
  );
  assert.equal(
    getSiteOrigin(request, {
      VERCEL_ENV: "production",
      SITE_URL: "https://lestly.test/",
    }),
    "https://lestly.test",
  );
  assert.equal(getSiteOrigin(request, {}), "http://localhost:5193");
});

test("provider linking uses the existing PKCE completion route on the preview origin", async () => {
  let callback: URL | undefined;
  const route = loadMockedModule<{
    action(args: { request: Request }): Promise<Response>;
  }>(
    new URL("../app/features/users/api/connect-provider.tsx", import.meta.url),
    {
      "react-router": router,
      zod: { z },
      "~/core/lib/site-origin.server": { getSiteOrigin },
      "~/features/auth/lib/social-oauth": { getSocialOAuthOptions },
      "~/core/lib/guards.server": {
        requireMethod: () => () => {},
        requireAuthentication: async () => ({ id: "existing-user" }),
      },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            auth: {
              linkIdentity: async (args: {
                options: { redirectTo: string; queryParams: { scope: string } };
              }) => {
                callback = new URL(args.options.redirectTo);
                assert.equal(
                  args.options.queryParams.scope,
                  "profile_nickname,profile_image",
                );
                return {
                  data: { url: "https://auth.example.test/authorize" },
                  error: null,
                };
              },
            },
          },
          new Headers(),
        ],
      },
    },
    {
      URL,
      process: {
        env: { SITE_URL: "https://lestly.test", VERCEL_ENV: "preview" },
      },
    },
  );
  const body = new URLSearchParams({ provider: "kakao" });
  const response = await route.action({
    request: new Request("https://preview.lestly.test/api/users/providers", {
      method: "POST",
      body,
    }),
  });
  assert.equal(response.status, 302);
  assert.equal(callback?.origin, "https://preview.lestly.test");
  assert.equal(callback?.pathname, "/auth/social/complete/kakao");
});

test("OAuth callback completes a session and claims the managed student without email", async () => {
  const claims: string[] = [];
  const client = {
    auth: {
      exchangeCodeForSession: async () => ({
        data: { user: { id: "kakao-id" } },
        error: null,
      }),
    },
    rpc: async (name: string, args: { p_token_hash: string }) => {
      assert.equal(name, "claim_student_invite");
      claims.push(args.p_token_hash);
      return { error: null };
    },
  };
  const route = loadMockedModule<Handler>(
    new URL(
      "../app/features/auth/screens/social/complete.tsx",
      import.meta.url,
    ),
    {
      "react/jsx-runtime": {},
      "react-router": router,
      zod: { z },
      "~/core/lib/supa-client.server": {
        default: () => [client, new Headers()],
      },
      "~/features/admin/guards.server": { isAdmin: async () => null },
      "~/features/admin/lib/student-invite.server": {
        hashStudentInviteToken: (token: string) => `hashed-${token}`,
      },
    },
    { URL },
  );
  for (const query of ["code=valid-code", "code=valid-code&invite=token"]) {
    const result = await route.loader({
      request: new Request(
        `https://lestly.test/auth/social/complete/kakao?${query}`,
      ),
    });
    assert.equal((result as Response).headers.get("Location"), "/dashboard");
  }
  assert.deepEqual(claims, ["hashed-token"]);
});

test("password API rejects email-less accounts before attempting an Auth update", async () => {
  let updates = 0;
  const route = loadMockedModule<{
    action(args: { request: Request }): Promise<Result>;
  }>(
    new URL("../app/features/users/api/change-password.tsx", import.meta.url),
    {
      "react-router": router,
      zod: { z },
      "~/core/lib/guards.server": {
        requireMethod: () => () => {},
        requireAuthentication: async () => ({ id: "kakao-id" }),
      },
      "~/core/lib/supa-client.server": {
        default: () => [
          {
            auth: {
              updateUser: async () => {
                updates++;
                return { error: null };
              },
            },
          },
          new Headers(),
        ],
      },
    },
  );
  const result = await route.action({
    request: new Request("https://lestly.test/api/users/password", {
      method: "POST",
    }),
  });
  assert.equal(result.init?.status, 400);
  assert.equal(updates, 0);
});

test("contact requests accept missing email and still validate a provided reply address", async () => {
  const messages: Array<{ text: string }> = [];
  const components = Object.fromEntries(
    [
      "@hcaptcha/react-hcaptcha",
      "react",
      "react-turnstile",
      "sonner",
      "~/core/components/form-button",
      "~/core/components/form-error",
      "~/core/components/ui/input",
      "~/core/components/ui/label",
      "~/core/components/ui/textarea",
    ].map((id) => [id, {}]),
  );
  const route = loadMockedModule<{
    action(args: { request: Request }): Promise<Result>;
  }>(
    new URL("../app/features/contact/screens/contact-us.tsx", import.meta.url),
    {
      ...components,
      "react/jsx-runtime": {},
      "react-router": router,
      zod: { z },
      "~/core/lib/guards.server": { requireMethod: () => () => {} },
      "~/core/lib/resend-client.server": {
        default: {
          emails: {
            send: async (message: { text: string }) => {
              messages.push(message);
              return { error: null };
            },
          },
        },
      },
    },
    {
      URLSearchParams,
      process: { env: { ADMIN_EMAIL: "admin@example.test" } },
      fetch: async () => new Response(JSON.stringify({ success: true })),
    },
  );
  for (const email of [
    undefined,
    "",
    "   ",
    "invalid-email",
    "reply@example.test",
  ]) {
    const body = new URLSearchParams({
      name: "Student",
      message: "Question",
      hcaptcha: "test",
      turnstile: "test",
    });
    if (email !== undefined) body.set("email", email);
    const result = await route.action({
      request: new Request("https://lestly.test/contact", {
        method: "POST",
        body,
      }),
    });
    assert.equal(
      result.init?.status ?? 200,
      email === "invalid-email" ? 400 : 200,
    );
  }
  assert.equal(messages.length, 4);
  assert.match(messages[0].text, /Email: 미입력/);
  assert.match(messages[3].text, /reply@example.test/);
});
