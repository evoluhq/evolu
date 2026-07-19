import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Coverage with v8 only works with a single browser instance. The VS Code
// Vitest extension enables coverage internally instead of passing --coverage,
// so extension runs need the same browser setup.
const isSingleBrowserRun =
  process.argv.includes("--coverage") || process.env.VITEST_VSCODE === "true";

export default defineProject({
  // Transpile `using`/`await using` for WebKit which doesn't support it yet
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
    snapshotSerializers: [
      resolve(__dirname, "./test/local-first/_uint8ArraySerializer.ts"),
    ],
    include: ["test/*.test.ts"],
    exclude: [
      "test/Sqlite.test.ts", // needs SQLite
      "test/TreeShaking.test.ts", // needs esbuild
      "test/Identicon.test.ts", // needs canvas
      "test/Redacted.test.ts", // uses node:util
    ],
    name: "@evolu/common",
    setupFiles: ["./test/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false, // false is faster for some reason.
      commands: {
        startWsServer: async () => {
          const { createServer } =
            await import("./test/_webSocketTestServer.ts");
          return createServer();
        },
        stopWsServer: async (_, port: number) => {
          const { closeServer } =
            await import("./test/_webSocketTestServer.ts");
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
