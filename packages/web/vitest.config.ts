import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

// Coverage with v8 only works with a single browser instance
const isCoverage = process.argv.includes("--coverage");

export default defineProject({
  // Transpile `using`/`await using` for WebKit which doesn't support it yet
  esbuild: { supported: { using: false } },
  optimizeDeps: {
    // Preserve import.meta.url so the WASM binary can be located at runtime.
    exclude: ["@evolu/sqlite-wasm"],
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/_setup.ts"],
    browser: {
      enabled: true,
      // WebKit OPFS sync access handles fail in Playwright's ephemeral context.
      provider: playwright({ persistentContext: true }),
      headless: true,
      fileParallelism: false, // false is faster for some reason.
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
