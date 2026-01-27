import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Coverage with v8 only works with a single browser instance
const isCoverage = process.argv.includes("--coverage");

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    projects: [
      {
        test: {
          snapshotSerializers: ["./test/local-first/_uint8ArraySerializer.ts"],
          include: ["test/**/*.test.ts"],
          name: "unit",
          environment: "node",
        },
      },
      {
        // Transpile `using`/`await using` for WebKit which doesn't support it yet
        esbuild: { supported: { using: false } },
        test: {
          snapshotSerializers: ["./test/local-first/_uint8ArraySerializer.ts"],
          include: ["test/*.test.ts"],
          exclude: [
            "test/WebSocket.test.ts", // needs server
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
            instances: isCoverage
              ? [{ browser: "chromium" }]
              : [
                  { browser: "chromium" },
                  { browser: "firefox" },
                  { browser: "webkit" },
                ],
          },
        },
      },
    ],
  },
});
