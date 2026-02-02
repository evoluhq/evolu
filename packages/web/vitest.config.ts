import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Coverage with v8 only works with a single browser instance
const isCoverage = process.argv.includes("--coverage");

export default defineConfig({
  // Transpile `using`/`await using` for WebKit which doesn't support it yet
  esbuild: { supported: { using: false } },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
      reporter: ["text", "html"],
    },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false,
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
