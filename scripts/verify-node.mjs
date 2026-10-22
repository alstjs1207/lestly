import {
  isSupportedNodeVersion,
  minimumNodeVersion,
} from "./node-runtime-policy.ts";

console.log(`[node-security] build Node.js ${process.version}`);
if (!isSupportedNodeVersion(process.version)) {
  console.error(
    `Node.js ${minimumNodeVersion} or newer on the 24.x LTS line is required. See .nvmrc.`,
  );
  process.exitCode = 1;
}
