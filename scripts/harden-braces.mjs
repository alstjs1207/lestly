/** Temporary fix for GHSA-vfj7-8cjw-p6xm, which has no upstream patched release.
 * Fail installation on unexpected source/version rather than silently skipping.
 * Bound nesting before the parser builds an AST used by recursive walkers.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
const marker = "/* Lestly: bound brace nesting (GHSA-vfj7-8cjw-p6xm). */";
let patched = 0;
for (const [directory, metadata] of Object.entries(lock.packages)) {
  if (!directory.endsWith("node_modules/braces")) continue;
  if (metadata.version !== "3.0.3")
    throw new Error(
      "Re-review braces security patch before changing its version",
    );
  const file = path.join(root, directory, "lib/parse.js");
  let source = await readFile(file, "utf8");
  if (!source.includes(marker)) {
    if (
      createHash("sha256").update(source).digest("hex") !==
      "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310"
    )
      throw new Error("Unexpected braces parser source");
    const insertion = `  ${marker}
  let nestingDepth = 0;
  for (const character of input) {
    if (character === '{' || character === '(') nestingDepth++;
    else if (character === '}' || character === ')') nestingDepth = Math.max(0, nestingDepth - 1);
    if (nestingDepth > 64) throw new SyntaxError('Pattern nesting exceeds security limit');
  }
`;
    source = source.replace(
      "  const opts = options || {};",
      insertion + "\n  const opts = options || {};",
    );
    await writeFile(file, source);
  }
  patched++;
}
console.log(
  `Applied/verified nesting guard to ${patched} braces installation(s)`,
);
