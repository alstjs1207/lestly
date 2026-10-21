import assert from "node:assert/strict";
import test from "node:test";

import { getSafeHttpUrl } from "../app/core/lib/web-url.ts";
import {
  MAX_CATALOG_IMAGE_BYTES,
  parseCatalogId,
  parseInstructorForm,
  parseProgramForm,
  validateCatalogImage,
} from "../app/features/admin/lib/catalog-form.server.ts";

function form(entries: Record<string, string>) {
  const value = new FormData();
  for (const [key, entry] of Object.entries(entries)) value.set(key, entry);
  return value;
}

test("catalog images validate real raster bytes and use MIME-based extensions", async () => {
  for (const [type, bytes, extension] of [
    [
      "image/png",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "png",
    ],
    ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]), "jpg"],
    ["image/gif", "GIF89a", "gif"],
    ["image/webp", "RIFF1234WEBP", "webp"],
  ] as const) {
    const file = new File([bytes], "unsafe-name.html", { type });
    const result = await validateCatalogImage(file);
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.extension, extension);
  }
  assert.equal(
    (
      await validateCatalogImage(
        new File(["<svg onload='alert(1)'/>"], "attack.svg", {
          type: "image/svg+xml",
        }),
      )
    ).success,
    false,
  );
  assert.equal(
    (
      await validateCatalogImage(
        new File(["<html>"], "fake.png", { type: "image/png" }),
      )
    ).success,
    false,
  );
  assert.equal(
    (await validateCatalogImage("https://example.test/file.png")).success,
    false,
  );
});

test("catalog upload limits keep the advertised 5MB cap", async () => {
  const bytes = new Uint8Array(MAX_CATALOG_IMAGE_BYTES);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(
    (
      await validateCatalogImage(
        new File([bytes], "cover.png", { type: "image/png" }),
      )
    ).success,
    true,
  );
  assert.equal(
    (
      await validateCatalogImage(
        new File(
          [new Uint8Array(MAX_CATALOG_IMAGE_BYTES + 1)],
          "too-large.png",
          { type: "image/png" },
        ),
      )
    ).success,
    false,
  );
  assert.deepEqual(await validateCatalogImage(new File([], "")), {
    success: true,
    file: null,
    extension: null,
  });
});

test("instructor SNS rejects active/relative URLs and accepts ordinary web URLs", () => {
  for (const unsafe of [
    "javascript:alert(1)",
    "data:text/html,<script>bad</script>",
    "file:///etc/passwd",
    "//example.test",
    "java\nscript:alert(1)",
  ]) {
    assert.equal(
      parseInstructorForm(form({ name: "강사", sns_instagram: unsafe }))
        .success,
      false,
    );
    assert.equal(
      parseInstructorForm(form({ name: "강사", sns_youtube: unsafe })).success,
      false,
    );
  }
  const good = parseInstructorForm(
    form({
      name: "강사",
      career: '["작품전","강의"]',
      sns_instagram: " https://instagram.com/person ",
      sns_youtube: "http://youtube.com/person",
    }),
  );
  assert.equal(good.success, true);
  if (good.success)
    assert.equal(good.data.sns_instagram, "https://instagram.com/person");
});

test("career and curriculum require the shapes used by their public renderers", () => {
  for (const career of [
    '{"role":"admin"}',
    "null",
    '[{"text":"bad"}]',
    '"text"',
    "{invalid}",
  ]) {
    assert.equal(
      parseInstructorForm(form({ name: "강사", career })).success,
      false,
    );
  }
  for (const curriculum of [
    '{"session":1}',
    "null",
    '[{"session":"1","title":"x"}]',
    '[{"session":1,"title":{}}]',
    "[null]",
  ]) {
    assert.equal(
      parseProgramForm(form({ title: "클래스", status: "ACTIVE", curriculum }))
        .success,
      false,
    );
  }
  assert.equal(
    parseProgramForm(
      form({
        title: "클래스",
        status: "ACTIVE",
        curriculum: '[{"session":1,"title":"실습","description":"설명"}]',
      }),
    ).success,
    true,
  );
});

test("program fields reject invalid enum/numeric values and preserve free prices", () => {
  for (const [key, value] of [
    ["status", "INVALID"],
    ["level", "expert"],
    ["location_type", "javascript:alert(1)"],
    ["price", "Infinity"],
    ["price", "-1"],
    ["price", "1000junk"],
    ["instructor_id", "1abc"],
    ["instructor_id", "1.5"],
    ["duration_minutes", "0"],
    ["total_sessions", "-1"],
    ["max_capacity", "1.5"],
  ]) {
    const valueForm = form({ title: "클래스", status: "ACTIVE" });
    valueForm.set(key, value);
    assert.equal(parseProgramForm(valueForm).success, false, `${key}=${value}`);
  }
  const free = parseProgramForm(
    form({ title: "클래스", status: "DRAFT", price: "0" }),
  );
  assert.equal(free.success, true);
  if (free.success) assert.equal(free.data.price, 0);
});

test("catalog route IDs reject partial values and unsafe integers", () => {
  for (const value of [undefined, "0", "-1", "1x", "1.5", "9007199254740992"]) {
    assert.equal(parseCatalogId(value), null);
  }
  assert.equal(parseCatalogId("42"), 42);
});

test("public SNS links suppress legacy executable URLs and invalid JSON values", () => {
  for (const value of [
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,test",
    "file:///tmp/attack",
    "//example.test",
    "relative/path",
    {},
    ["https://example.test"],
    null,
  ]) {
    assert.equal(getSafeHttpUrl(value), null);
  }
  assert.equal(
    getSafeHttpUrl(" HTTPS://Instagram.com/person "),
    "https://instagram.com/person",
  );
  assert.equal(
    getSafeHttpUrl("http://youtube.com/person"),
    "http://youtube.com/person",
  );
});
