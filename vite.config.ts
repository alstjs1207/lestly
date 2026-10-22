import mdx from "@mdx-js/rollup";
import { reactRouter } from "@react-router/dev/vite";
import {
  type SentryReactRouterBuildOptions,
  sentryReactRouter,
} from "@sentry/react-router/vite";
import tailwindcss from "@tailwindcss/vite";
import { type PluginOption, defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(async (config) => {
  const sentryConfig: SentryReactRouterBuildOptions = {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    telemetry: false,
    sourcemaps: {
      filesToDeleteAfterUpload: ["./build/client/**/*.map"],
    },
  };
  let plugins: PluginOption[] = [
    mdx(),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ];
  if (
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN
  ) {
    plugins = [...plugins, ...(await sentryReactRouter(sentryConfig, config))];
  }
  return {
    server: {
      allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean),
      watch: {
        ignored: [
          "**/*.spec.ts",
          "**/*.test.ts",
          "**/tests/**",
          "**/playwright-report/**",
          "**/test-results/**",
        ],
      },
    },
    build: {
      sourcemap:
        process.env.SENTRY_AUTH_TOKEN &&
        process.env.SENTRY_ORG &&
        process.env.SENTRY_PROJECT
          ? ("hidden" as const)
          : false,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Only apply to client build (node_modules)
            if (id.includes("node_modules")) {
              // FullCalendar packages - separate chunk for lazy loading
              if (id.includes("@fullcalendar")) {
                return "vendor-fullcalendar";
              }
              // Radix UI components
              if (id.includes("@radix-ui")) {
                return "vendor-ui";
              }
            }
          },
        },
      },
    },
    plugins,
    sentryConfig,
  };
});
