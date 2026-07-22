import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";

const isSingleBrowserRun =
  process.argv.includes("--coverage") || process.env.VITEST_VSCODE === "true";

export default defineProject({
  root: resolve(import.meta.dirname, "../../.."),
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
    include: [
      "test/integration/vitest/LockManager/*.test.ts",
      "test/integration/vitest/Platform/*.test.ts",
      "test/integration/vitest/StackTrace/*.test.ts",
      "test/integration/vitest/Task/*.test.ts",
      "test/integration/vitest/WebSocket/*.test.ts",
    ],
    name: "@evolu/common integration (browser)",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false,
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
      instances: isSingleBrowserRun
        ? [{ browser: "chromium" }]
        : [
            { browser: "chromium" },
            { browser: "firefox" },
            { browser: "webkit" },
          ],
    },
  },
});
