import assert from "node:assert/strict";
import test from "node:test";

import {
  RequestBodyError,
  readBoundedJson,
} from "../app/core/lib/request-body.ts";
import { consultRequestSchema } from "../app/features/class/consult-validation.ts";

test("consultation accepts normalized contact details and rejects invalid types and oversized fields", () => {
  const valid = consultRequestSchema.parse({
    programId: 1,
    name: " 홍길동 ",
    phone: "010-1234-5678",
  });
  assert.deepEqual(valid, {
    programId: 1,
    name: "홍길동",
    phone: "01012345678",
  });
  for (const input of [
    null,
    { ...valid, name: " " },
    { ...valid, phone: 12345 },
    { ...valid, programId: -1 },
    { ...valid, programId: 1.5 },
    { ...valid, message: "x".repeat(2001) },
  ]) {
    assert.equal(consultRequestSchema.safeParse(input).success, false);
  }
});

test("JSON reader rejects malformed JSON and enforces the actual body size", async () => {
  const make = (body: string, headers = {}) =>
    new Request("https://lestly.test", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json", ...headers },
    });
  assert.deepEqual(await readBoundedJson(make('{"ok":true}')), { ok: true });
  await assert.rejects(
    readBoundedJson(make("invalid")),
    (e: unknown) => e instanceof RequestBodyError && e.status === 400,
  );
  await assert.rejects(
    readBoundedJson(
      make('"' + "한".repeat(100) + '"', { "Content-Length": "1" }),
      100,
    ),
    (e: unknown) => e instanceof RequestBodyError && e.status === 413,
  );
  await assert.rejects(
    readBoundedJson(make("{}", { "Content-Type": "text/plain" })),
    (e: unknown) => e instanceof RequestBodyError && e.status === 415,
  );
});
