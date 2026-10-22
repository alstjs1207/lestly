import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const braces = require("braces");
test("installed braces rejects deeply nested patterns before recursive compilation", () => {
  assert.deepEqual(braces.expand("src/{app,tests}/*.ts"), [
    "src/app/*.ts",
    "src/tests/*.ts",
  ]);
  for (const options of [{}, { expand: true }]) {
    assert.throws(
      () => braces("{".repeat(20000) + "a" + "}".repeat(20000), options),
      /Pattern nesting exceeds security limit/,
    );
  }
});
