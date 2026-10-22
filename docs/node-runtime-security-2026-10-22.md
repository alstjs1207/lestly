# Node.js runtime security baseline — 2026-10-22

- Advisory: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- Vercel runtime policy: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Previous production deployment `BiL2ZNwn6cpRvYUspxakacoSBmCE` used `24.x`. Its existing logs did not record the exact patch version, so its patch status cannot be established retrospectively from those logs.
- `package.json` selects `24.x`; `.nvmrc` selects the patched local baseline `24.22.1`. Vercel manages minor/patch updates within the selected major line.
- `npm run verify:node` runs before every production build and rejects versions below `24.22.1`, unsupported major lines, and prereleases.
- Build logs record `[node-security] build Node.js …`; private server initialization logs record `[node-security] runtime Node.js …`. Check both because the build machine and function runtime are distinct.
- Verified locally with the official Node.js `24.22.1` macOS ARM64 archive after checking its SHA256 against Node.js `SHASUMS256.txt`: 99 unit tests, TypeScript validation, and production build passed. The local unsupported `25.9.0` installation was correctly rejected.
- This runtime advisory is separate from the remaining npm `braces` advisory described in `security-remediation-2026-10-22.md`.

## Managed runtime rollout limitation

Preview deployment `5HeD7aAx4Q5pJ5P6oBMnnaD8GEvE` (`351ef6f`) passed its build check using `24.22.1`. Its **actual function initialization log**, attached to request `8k6zx-1792680046389-ca0be94fea2b`, reported `24.21.0` at `2026-10-22 14:40:53.638 UTC`. The prerender log in the build is not proof of the function runtime version.

At verification time, [Vercel's official bulletin](https://vercel.com/kb/bulletin/node-js-security-advisory) states that patched managed runtimes are still rolling out. Its automatically applied WAF rules reduce inbound Brotli exploit exposure but do not cover fetched responses and do not replace runtime patching. Projects using 22.x/24.x do not need to change their major setting. A build passing the version check does **not** establish that a running function has been patched.

The Node.js runtime remediation remains pending until actual function logs show at least `24.22.1`. Do not report the runtime vulnerability as resolved based only on the successful deployment or build version. Local tests and preview HTTP checks passed, including login, legal pages, class details, nonce CSP, and consultation suspension.
