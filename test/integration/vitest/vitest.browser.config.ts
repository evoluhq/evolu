import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../node_modules/.vite/browser-integration-${mode}`,
  ),
  server: {
    forwardConsole: {
      unhandledErrors: false,
      logLevels: ["error", "warn"],
    },
  },
  plugins: [
    {
      name: "transform-using",
      enforce: "pre",
      transform: (code, id) =>
        code.includes("using ")
          ? transformWithEsbuild(code, id, {
              supported: { using: false },
            })
          : undefined,
    },
  ],
  test: {
    fileParallelism: false,
    include: [
      "test/integration/vitest/LockManager/*.test.ts",
      "test/integration/vitest/Platform/*.test.ts",
      "test/integration/vitest/StackTrace/*.test.ts",
      "test/integration/vitest/Task/*.test.ts",
      "test/integration/vitest/WebSocket/*.test.ts",
    ],
    name: "browser-integration",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      api: { port: 63316 },
      headless: true,
      commands: {
        startWsServer: async () => {
          const { createServer } =
            await import("./WebSocket/_webSocketTestServer.ts");
          return createServer();
        },
        stopWsServer: async (_, port: number) => {
          const { closeServer } =
            await import("./WebSocket/_webSocketTestServer.ts");
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
