import assert from "node:assert/strict";
import test from "node:test";

import {
  createDemoOrder,
  isPaymentDemoEnabled,
  isValidDemoOrder,
} from "../app/features/payments/lib/payment-demo.server.ts";

test("payment scaffold cannot charge live keys or run in production", () => {
  assert.equal(isPaymentDemoEnabled("production", "test_sk_example"), false);
  assert.equal(isPaymentDemoEnabled("development", "live_sk_example"), false);
  assert.equal(isPaymentDemoEnabled("development", undefined), false);
  assert.equal(isPaymentDemoEnabled("development", "test_sk_example"), true);
});

test("server orders bind the authenticated user, integrity and expiry", () => {
  const now = 1_700_000_000_000;
  const order = createDemoOrder("user-a", "test_sk_example", now);
  assert.ok(order.length <= 64);
  assert.equal(isValidDemoOrder(order, "user-a", "test_sk_example", now), true);
  assert.equal(
    isValidDemoOrder(order, "user-b", "test_sk_example", now),
    false,
  );
  assert.equal(
    isValidDemoOrder(
      order.slice(0, -1) + (order.endsWith("a") ? "b" : "a"),
      "user-a",
      "test_sk_example",
      now,
    ),
    false,
  );
  assert.equal(
    isValidDemoOrder(
      order,
      "user-a",
      "test_sk_example",
      now + 2 * 60 * 60 * 1000 + 1,
    ),
    false,
  );
});
