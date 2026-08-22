import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { createBrowserInstances } from "@evolu/typescript-config/vitest.ts";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";

export default defineProject(({ mode }) => ({
  root: import.meta.dirname,
  cacheDir: resolve(
    import.meta.dirname,
    `../../node_modules/.vite/browser-web-${mode}`,
  ),
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
  optimizeDeps: {
    // Preserve import.meta.url so the WASM binary can be located at runtime.
    exclude: ["@evolu/sqlite-wasm"],
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    // false is faster for some reason.
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
    name: "browser-web",
    setupFiles: ["./test/_setup.ts"],
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
