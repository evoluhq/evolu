import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../node_modules/.vite/browser-integration-${mode}`,
  ),
  // Target ES2025 so Vite lowers ES2026 `using`/`await using` for WebKit.
  oxc: {
    target: "es2025",
  },
  // Vue's ESM build warns unless its compile-time flags are defined, here as
  // their defaults: https://link.vuejs.org/feature-flags
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  test: {
    fileParallelism: false,
    include: [
      "test/integration/shared/LockManager/*.test.ts",
      "test/integration/shared/Platform/*.test.ts",
      "test/integration/shared/Polyfills/*.test.ts",
      "test/integration/shared/StackTrace/*.test.ts",
      "test/integration/shared/Task/*.test.ts",
      "test/integration/shared/Type/*.test.ts",
      "test/integration/shared/WebSocket/*.test.ts",
      "test/integration/browsers/Type/*.test.ts",
      "test/integration/browsers/react/*.test.ts",
      "test/integration/browsers/vue/*.test.ts",
    ],
    name: "browser-integration",
    setupFiles: ["./test/integration/shared/_setup.ts"],
    api: { port: 63316 },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      commands: {
        startWsServer: async () => {
          const { createServer } =
            await import("../shared/WebSocket/_webSocketTestServer.ts");
          return createServer();
        },
        stopWsServer: async (_, port: number) => {
          const { closeServer } =
            await import("../shared/WebSocket/_webSocketTestServer.ts");
          await closeServer(port);
        },
      },
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
