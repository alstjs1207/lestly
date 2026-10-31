import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertChangeEvidence,
  checkPolicies,
  classify,
  makeIndex,
} from "../scripts/spec-tools.mjs";

function fixture(run) {
  const root = mkdtempSync(path.join(os.tmpdir(), "lestly-spec-test-"));
  const put = (name, text) => {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  };
  const requirement = {
    id: "PAY-001",
    verification: "automated",
    sources: ["app/features/payments/example.ts"],
    tests: ["tests/payment.test.ts"],
    anchors: [
      {
        path: "app/features/payments/example.ts",
        contains: "export const example",
      },
    ],
  };
  const catalog = {
    version: 1,
    domains: [{ id: "payments", requirements: [requirement] }],
  };
  const spec =
    "# Payments Specification\n\n## Purpose\nA test policy\n\n## Requirements\n\n### Requirement: PAY-001 Example\nThe system SHALL validate the order.\n\n#### Scenario: Order\n- **WHEN** an order arrives\n- **THEN** it is checked\n";
  put("app/features/payments/example.ts", "export const example = 1;");
  put("tests/payment.test.ts", "// test evidence fixture");
  put("openspec/specs/payments/spec.md", spec);
  const save = () => put("openspec/policy-map.json", JSON.stringify(catalog));
  const index = () =>
    put("openspec/source-index.json", JSON.stringify(makeIndex(root)));
  save();
  index();
  try {
    return run({ root, put, save, index, catalog, requirement, spec });
  } finally {
    rmSync(root, { recursive: true });
  }
}

test("policy checker accepts linked requirements without claiming scenario coverage", () =>
  fixture(({ root }) => {
    assert.deepEqual(checkPolicies(root), {
      domains: 1,
      requirements: 1,
      scenarios: 1,
      automated: 1,
      sourceReviewed: 0,
      files: 2,
    });
  }));
test("policy checker rejects deleted evidence and false automated status", () =>
  fixture(({ root, requirement, save }) => {
    requirement.sources = ["app/features/payments/missing.ts"];
    save();
    assert.throws(() => checkPolicies(root), /PAY-001.*ENOENT/);
    requirement.sources = ["app/features/payments/example.ts"];
    requirement.tests = [];
    save();
    assert.throws(() => checkPolicies(root), /Automated without tests/);
  }));
test("policy checker detects duplicate IDs, missing scenarios and unmapped requirements", () =>
  fixture(({ root, put, spec }) => {
    put(
      "openspec/specs/payments/spec.md",
      spec + spec.slice(spec.indexOf("### Requirement:")),
    );
    assert.throws(() => checkPolicies(root), /Duplicate requirement ID/);
    put(
      "openspec/specs/payments/spec.md",
      spec.replace("**THEN**", "expected"),
    );
    assert.throws(() => checkPolicies(root), /Missing WHEN\/THEN/);
    put("openspec/specs/payments/spec.md", spec.replace("PAY-001", "PAY-002"));
    assert.throws(() => checkPolicies(root), /Unmapped requirement/);
  }));
test("new feature and new migration need deliberate policy ownership", () => {
  assert.deepEqual(classify("app/features/new-product/api.ts"), []);
  assert.deepEqual(classify("sql/migrations/9999_unassigned_feature.sql"), []);
  assert.ok(
    classify("sql/migrations/0039_booking_lifecycle_integrity.sql").includes(
      "recurring-schedules",
    ),
  );
});
test("source inventory fails on new files until reviewed index is updated", () =>
  fixture(({ root, put, index }) => {
    put("app/features/payments/another.ts", "export const another = 1;");
    assert.throws(() => checkPolicies(root), /Source index is stale/);
    index();
    assert.equal(checkPolicies(root).files, 3);
    put("app/features/unknown/example.ts", "export const x = 1;");
    assert.throws(() => checkPolicies(root), /Unclassified source/);
  }));
test("evidence paths cannot escape the repository", () =>
  fixture(({ root, requirement, save }) => {
    requirement.sources = ["../outside"];
    save();
    assert.throws(() => checkPolicies(root), /Invalid evidence path/);
  }));
test("change gate rejects behavior-only changes and accepts a relevant requirement record", () =>
  fixture(({ catalog }) => {
    const runtime = "app/features/payments/example.ts";
    assert.throws(
      () => assertChangeEvidence([runtime], catalog, () => ""),
      /Missing policy\/change evidence/,
    );
    assert.throws(
      () =>
        assertChangeEvidence(
          [runtime, "openspec/changes/fix/tasks.md"],
          catalog,
          () => "AUTH-001",
        ),
      /Missing policy\/change evidence/,
    );
    assert.deepEqual(
      assertChangeEvidence(
        [runtime, "openspec/changes/fix/tasks.md"],
        catalog,
        () => "Fix PAY-001; reproduce rejected order; run regression.",
      ),
      ["payments"],
    );
    assert.deepEqual(
      assertChangeEvidence(
        [runtime, "openspec/specs/payments/spec.md"],
        catalog,
        () => "",
      ),
      ["payments"],
    );
  }));
test("change gate checks every affected domain and treats deleted code as a change", () => {
  const catalog = {
    domains: [
      { id: "recurring-schedules", requirements: [{ id: "SER-001" }] },
      { id: "booking", requirements: [{ id: "BOOK-001" }] },
    ],
  };
  const changed = [
    "app/features/admin/api/schedules/update.tsx",
    "openspec/changes/fix/tasks.md",
  ];
  assert.throws(
    () => assertChangeEvidence(changed, catalog, () => "SER-001"),
    /booking/,
  );
  assert.deepEqual(
    assertChangeEvidence(changed, catalog, () => "SER-001 BOOK-001"),
    ["recurring-schedules", "booking"],
  );
});

test("policy checker detects stale anchors in existing implementation files", () =>
  fixture(({ root, requirement, save }) => {
    requirement.anchors[0].contains = "removedOrderValidator";
    save();
    assert.throws(
      () => checkPolicies(root),
      /Missing implementation anchor: PAY-001/,
    );
  }));
