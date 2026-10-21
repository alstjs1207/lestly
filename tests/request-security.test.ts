import assert from "node:assert/strict";
import test from "node:test";

import { requireMethod } from "../app/core/lib/guards.server.ts";
import {
  getSafeEmailRedirect,
  getSafeRedirectPath,
  isSameOriginRequest,
} from "../app/core/lib/request-security.ts";

function request(headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://lestly.test/account", { method, headers });
}

test("mutation guard accepts its origin and header-less internal clients", () => {
  assert.equal(
    isSameOriginRequest(request({ Origin: "https://lestly.test" })),
    true,
  );
  assert.equal(isSameOriginRequest(request()), true);
  assert.equal(
    isSameOriginRequest(request({ Referer: "https://lestly.test/account" })),
    true,
  );
  requireMethod("POST")(request({ Origin: "https://lestly.test" }));
});

test("mutation guard rejects attacker, opaque, sibling, and malformed origins", () => {
  for (const origin of [
    "https://evil.test",
    "null",
    "https://sub.lestly.test",
    "https://lestly.test.evil.test",
  ]) {
    assert.equal(isSameOriginRequest(request({ Origin: origin })), false);
  }
  assert.equal(
    isSameOriginRequest(request({ Referer: "https://evil.test" })),
    false,
  );
  assert.equal(isSameOriginRequest(request({ Referer: "invalid" })), false);
  assert.equal(
    isSameOriginRequest(
      request({ Origin: "null", "Sec-Fetch-Site": "same-origin" }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        Referer: "https://lestly.test/account",
        "Sec-Fetch-Site": "cross-site",
      }),
    ),
    false,
  );
  assert.equal(
    isSameOriginRequest(
      request({
        Origin: "https://lestly.test",
        "Sec-Fetch-Site": "cross-site",
      }),
    ),
    false,
  );
});

test("Fetch Metadata protects requests with suppressed origin and referrer", () => {
  for (const site of ["cross-site", "same-site"]) {
    assert.equal(
      isSameOriginRequest(request({ "Sec-Fetch-Site": site })),
      false,
    );
  }
  for (const site of ["same-origin", "none"]) {
    assert.equal(
      isSameOriginRequest(request({ "Sec-Fetch-Site": site })),
      true,
    );
  }
});

test("method guard rejects foreign POSTs and advertises its allowed method", () => {
  assert.throws(
    () => requireMethod("POST")(request({ Origin: "https://evil.test" })),
    (error: unknown) =>
      (error as { init: { status: number } }).init.status === 403,
  );
  assert.throws(
    () => requireMethod("POST")(request({}, "DELETE")),
    (error: unknown) => {
      const response = error as {
        init: { status: number; headers: { Allow: string } };
      };
      return (
        response.init.status === 405 && response.init.headers.Allow === "POST"
      );
    },
  );
});

test("auth redirects preserve local query/hash and normalize dot segments", () => {
  assert.equal(
    getSafeRedirectPath("/admin/../dashboard?tab=schedule#today"),
    "/dashboard?tab=schedule#today",
  );
  assert.equal(getSafeRedirectPath(null), "/");
});

test("auth redirects reject URL parser bypasses and external destinations", () => {
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    " /dashboard",
    "/\t/evil.test",
    "/\n/evil.test",
    "/some/..//evil.test",
    "/%2e%2e//evil.test",
  ]) {
    assert.equal(getSafeRedirectPath(value, "/dashboard"), "/dashboard", value);
  }
});

test("email callbacks stay on the configured site and reject credentials", () => {
  const site = "https://lestly.test";
  const fallback = "/auth/confirm?next=/";
  assert.equal(
    getSafeEmailRedirect("/auth/confirm?next=/dashboard", site, fallback),
    `${site}/auth/confirm?next=/dashboard`,
  );
  assert.equal(
    getSafeEmailRedirect(`${site}/auth/confirm`, site, fallback),
    `${site}/auth/confirm`,
  );
  for (const value of [
    "https://evil.test/auth",
    "//evil.test/auth",
    "https://evil@lestly.test/auth",
    "/\\evil.test",
    "javascript:alert(1)",
  ]) {
    assert.equal(
      getSafeEmailRedirect(value, site, fallback),
      `${site}${fallback}`,
    );
  }
});
