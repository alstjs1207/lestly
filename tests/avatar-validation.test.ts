import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AVATAR_BYTES,
  getAvatarValidationError,
} from "../app/core/lib/avatar-validation.ts";

test("avatar checks MIME and actual raster signature", async () => {
  const fixtures: Array<[string, number[] | string]> = [
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/gif", "GIF89a"],
    ["image/webp", "RIFF1234WEBP"],
  ];
  for (const [type, content] of fixtures) {
    const file = new File(
      [typeof content === "string" ? content : new Uint8Array(content)],
      "avatar",
      { type },
    );
    assert.equal(await getAvatarValidationError(file), null);
  }
  assert.ok(
    await getAvatarValidationError(
      new File(["<html>"], "fake.png", { type: "image/png" }),
    ),
  );
  assert.ok(
    await getAvatarValidationError(
      new File(["<svg onload='alert(1)'/>"], "active.svg", {
        type: "image/svg+xml",
      }),
    ),
  );
  for (const type of ["constructor", "__proto__", "text/html"]) {
    assert.ok(
      await getAvatarValidationError(new File(["<html>"], "payload", { type })),
    );
  }
});

test("empty avatar means no change but oversized uploads are rejected", async () => {
  assert.equal(await getAvatarValidationError(new File([], "")), null);
  assert.match(
    (await getAvatarValidationError(
      new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.png", {
        type: "image/png",
      }),
    ))!,
    /1MB/,
  );
});
