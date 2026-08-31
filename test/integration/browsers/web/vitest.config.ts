import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";
import { defineProject } from "vitest/config";

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../../node_modules/.vite/browser-web-${mode}`,
  ),
  // Target ES2025 so Vite lowers ES2026 `using`/`await using` for WebKit.
  oxc: {
    target: "es2025",
  },
  optimizeDeps: {
    // Preserve import.meta.url so the WASM binary can be located at runtime.
    exclude: ["@evolu/sqlite-wasm"],
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    // false is faster for some reason.
    fileParallelism: false,
    include: ["test/integration/browsers/web/**/*.test.ts"],
    name: "browser-web",
    setupFiles: ["./test/integration/browsers/web/_setup.ts"],
    browser: {
      enabled: true,
      // WebKit OPFS sync access handles fail in Playwright's ephemeral context.
      provider: playwright({ persistentContext: true }),
      api: { port: 63317 },
      headless: true,
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
