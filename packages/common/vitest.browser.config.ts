import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Coverage with v8 only works with a single browser instance
const isCoverage = process.argv.includes("--coverage");

export default defineProject({
  // Transpile `using`/`await using` for WebKit which doesn't support it yet
  esbuild: { supported: { using: false } },
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
    name: "browser",
    setupFiles: ["./test/_browserSetup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false, // false is faster for some reason.
      commands: {
        startWsServer: async () => {
          const { createServer } = await import("./test/_globalSetup.js");
          return createServer();
        },
        stopWsServer: async (_, port: number) => {
          const { closeServer } = await import("./test/_globalSetup.js");
          await closeServer(port);
        },
      },
      instances: isCoverage
        ? [{ browser: "chromium" }]
        : [
            { browser: "chromium" },
            { browser: "firefox" },
            { browser: "webkit" },
          ],
    },
  },
});
