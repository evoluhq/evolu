import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../node_modules/.vite/browser-integration-${mode}`,
  ),
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
    name: "browser-integration",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      api: { port: 63316 },
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
      instances:
        // V8 coverage only works with Chromium.
        process.argv.includes("--coverage")
          ? [{ browser: "chromium" }]
          : mode === "firefox-webkit"
            ? [{ browser: "firefox" }, { browser: "webkit" }]
            : [
                { browser: "chromium" },
                { browser: "firefox" },
                { browser: "webkit" },
              ],
    },
  },
}));
