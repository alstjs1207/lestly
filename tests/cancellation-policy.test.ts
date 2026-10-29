import assert from "node:assert/strict";
import test from "node:test";

import { getBookingPolicy } from "../app/features/app-settings/booking-policy.server.ts";
import {
  canCancelWithPolicy,
  cancellationDeadline,
  cancellationPolicyFromForm,
  cancellationPolicySchema,
} from "../app/features/app-settings/cancellation-policy.ts";

test("previous-day deadline is KST midnight, distinct from 24 hours before; exact boundaries are consistent", () => {
  const start = new Date("2026-11-02T18:00:00+09:00");
  const previous = { mode: "previous_day" } as const;
  const hours = { mode: "hours_before", hours: 24 } as const;
  assert.equal(
    cancellationDeadline(start, previous).toISOString(),
    "2026-11-01T15:00:00.000Z",
  );
  assert.equal(
    cancellationDeadline(start, hours).toISOString(),
    "2026-11-01T09:00:00.000Z",
  );
  for (const [p, at, before, after] of [
    [previous, false, true, false],
    [hours, true, true, false],
  ] as const) {
    const deadline = cancellationDeadline(start, p);
    assert.equal(canCancelWithPolicy(start, p, deadline), at);
    assert.equal(
      canCancelWithPolicy(start, p, new Date(+deadline - 1)),
      before,
    );
    assert.equal(canCancelWithPolicy(start, p, new Date(+deadline + 1)), after);
  }
  const zero = { mode: "hours_before", hours: 0 } as const;
  assert.equal(canCancelWithPolicy(start, zero, new Date(+start - 1)), true);
  assert.equal(canCancelWithPolicy(start, zero, start), false);
  assert.equal(
    canCancelWithPolicy(start, previous, new Date(+start + 1)),
    false,
  );
});

test("policy and forms reject mixed modes, nulls, invalid bounds and fractions", () => {
  for (const value of [
    null,
    {},
    { mode: "both" },
    { mode: "previous_day", hours: 24 },
    { mode: "hours_before" },
    { mode: "hours_before", hours: "24" },
    { mode: "hours_before", hours: -1 },
    { mode: "hours_before", hours: 721 },
    { mode: "hours_before", hours: 1.5 },
  ])
    assert.equal(cancellationPolicySchema.safeParse(value).success, false);
  const form = new FormData();
  form.set("cancellationMode", "previous_day");
  form.set("cancellationHours", "bad");
  assert.deepEqual(cancellationPolicyFromForm(form), { mode: "previous_day" });
  form.set("cancellationMode", "hours_before");
  for (const raw of ["", "1.5", "1e2", "-1", "721"]) {
    form.set("cancellationHours", raw);
    assert.throws(() => cancellationPolicyFromForm(form));
  }
  form.set("cancellationHours", "0");
  assert.deepEqual(cancellationPolicyFromForm(form), {
    mode: "hours_before",
    hours: 0,
  });
});

test("separate cancellation setting resolves with defaults only when absent and corrupt data fails closed", async () => {
  let rows: any[] = [];
  const q: any = {
    select: () => q,
    eq: () => q,
    in: async () => ({ data: rows, error: null }),
  };
  const read = () =>
    getBookingPolicy({ from: () => q } as any, { organizationId: "org-a" });
  assert.deepEqual((await read()).cancellationPolicy, { mode: "previous_day" });
  rows = [
    {
      setting_key: "cancellation_policy",
      setting_value: { mode: "hours_before", hours: 3 },
    },
  ];
  assert.deepEqual((await read()).cancellationPolicy, {
    mode: "hours_before",
    hours: 3,
  });
  rows[0].setting_value = null;
  await assert.rejects(read());
});
