# Node.js runtime security baseline — 2026-10-22

- Advisory: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- Vercel runtime policy: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Previous production deployment `BiL2ZNwn6cpRvYUspxakacoSBmCE` used `24.x`. Its existing logs did not record the exact patch version, so its patch status cannot be established retrospectively from those logs.
- `package.json` selects `24.x`; `.nvmrc` selects the patched local baseline `24.22.1`. Vercel manages minor/patch updates within the selected major line.
- `npm run verify:node` runs before every production build and rejects versions below `24.22.1`, unsupported major lines, and prereleases.
- Build logs record `[node-security] build Node.js …`; private server initialization logs record `[node-security] runtime Node.js …`. Check both because the build machine and function runtime are distinct.
- Verified locally with the official Node.js `24.22.1` macOS ARM64 archive after checking its SHA256 against Node.js `SHASUMS256.txt`: 99 unit tests, TypeScript validation, and production build passed. The local unsupported `25.9.0` installation was correctly rejected.
- This runtime advisory is separate from the remaining npm `braces` advisory described in `security-remediation-2026-10-22.md`.
