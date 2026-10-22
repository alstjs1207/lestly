// https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
// Vercel selects a major line and manages minor/patch runtime updates.
export const minimumNodeVersion = "24.22.1";

export function isSupportedNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}
