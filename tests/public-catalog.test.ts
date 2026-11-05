import assert from "node:assert/strict";
import test from "node:test";

import { loadMockedModule } from "./helpers/mocked-module.ts";

test("public class lookup uses the safe RPC for every visitor and propagates errors without a raw-table fallback", async () => {
  const { getPublicProgramBySlug } = loadMockedModule<{
    getPublicProgramBySlug(
      client: unknown,
      input: { slug: string },
    ): Promise<unknown>;
  }>(new URL("../app/features/class/queries.ts", import.meta.url), {});
  const calls: unknown[] = [];
  const payload = { program_id: 9, title: "소개", instructor: null };
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return { data: payload, error: null };
    },
  };
  assert.equal(
    await getPublicProgramBySlug(client, { slug: "art_mask" }),
    payload,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["get_public_program_by_slug", { p_slug: "art_mask" }],
  ]);
  assert.equal(
    await getPublicProgramBySlug(
      { rpc: async () => ({ data: null, error: null }) },
      { slug: "missing" },
    ),
    null,
  );
  await assert.rejects(
    getPublicProgramBySlug(
      { rpc: async () => ({ data: null, error: new Error("denied") }) },
      { slug: "art_mask" },
    ),
    /denied/,
  );
});
