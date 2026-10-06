import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";
import { defineProject } from "vitest/config";
import { checkSqliteWasm } from "../_checkSqliteWasm.ts";

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../../node_modules/.vite/browser-sqlite-wasm-${mode}`,
  ),
  // Target ES2025 so Vite lowers ES2026 `using`/`await using` for WebKit.
  oxc: {
    target: "es2025",
  },
  plugins: [checkSqliteWasm],
  optimizeDeps: {
    // Preserve import.meta.url so the WASM binary can be located at runtime.
    exclude: ["@evolu/sqlite-wasm", "@evolu/sqlite-wasm-2.2.4"],
  },
  test: {
    // The tests share the browser's OPFS and terminate workers that hold it.
    fileParallelism: false,
    include: ["test/integration/browsers/sqlite-wasm/*.test.ts"],
    name: "browser-sqlite-wasm",
    setupFiles: ["./test/integration/browsers/sqlite-wasm/_setup.ts"],
    browser: {
      enabled: true,
      // WebKit OPFS sync access handles fail in Playwright's ephemeral context.
      // A profile of its own, because browser-web's browser can have the
      // default one open at the same time.
      provider: playwright({
        persistentContext: resolve(
          import.meta.dirname,
          "../../../../node_modules/.cache/vitest-playwright-user-data-sqlite-wasm",
        ),
      }),
      api: { port: 63318 },
      headless: true,
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
