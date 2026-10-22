import assert from "node:assert/strict";
import test from "node:test";

import { isSupportedNodeVersion } from "../scripts/node-runtime-policy.ts";

test("Node runtime policy rejects unpatched and unsupported versions", () => {
  for (const version of [
    "24.22.0",
    "v24.21.9",
    "22.23.4",
    "25.9.0",
    "26.12.1",
    "24.x",
    "24.22.1-rc.1",
  ]) {
    assert.equal(isSupportedNodeVersion(version), false, version);
  }
  for (const version of ["24.22.1", "v24.22.1", "24.22.2", "24.23.0"]) {
    assert.equal(isSupportedNodeVersion(version), true, version);
  }
});
