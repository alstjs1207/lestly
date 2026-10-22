import type { Config } from "@react-router/dev/config";

import { sentryOnBuildEnd } from "@sentry/react-router/vite";
import { vercelPreset } from "@vercel/react-router/vite";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

declare module "react-router" {
  interface Future {
    unstable_middleware: true;
  }
}

async function removeClientMaps(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await removeClientMaps(file);
    else if (entry.name.endsWith(".map")) await rm(file);
  }
}

export default {
  ssr: true,
  async prerender() {
    return ["/sitemap.xml", "/robots.txt"];
  },
  presets: [...(process.env.VERCEL ? [vercelPreset()] : [])],
  buildEnd: async ({ viteConfig, reactRouterConfig, buildManifest }) => {
    if (
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      process.env.SENTRY_AUTH_TOKEN
    ) {
      try {
        await sentryOnBuildEnd({
          viteConfig,
          reactRouterConfig,
          buildManifest,
        });
      } finally {
        await removeClientMaps(
          path.join(reactRouterConfig.buildDirectory, "client"),
        );
      }
    }
  },
} satisfies Config;
