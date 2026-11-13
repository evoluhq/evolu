import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";

// The playgrounds' component tests import apps/web's TSX. A project of their
// own keeps the env define below away from the other browser tests: with a
// `process.env.*` define, Vite replaces `process.env` reads statically, so a
// test that changes NODE_ENV at run time, as Task.test.ts does for
// Platform.ts, would no longer reach them.
export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../../node_modules/.vite/browser-playgrounds-${mode}`,
  ),
  oxc: {
    // Target ES2025 so Vite lowers ES2026 `using`/`await using` for WebKit.
    target: "es2025",
    // apps/web's tsconfig preserves JSX for Next.js.
    jsx: { runtime: "automatic" },
  },
  // Next.js inlines the playgrounds' public env, unset in their tests.
  define: { "process.env.NEXT_PUBLIC_EVOLU_RELAY_URL": "undefined" },
  test: {
    fileParallelism: false,
    include: ["test/integration/browsers/playgrounds/*.test.ts"],
    name: "browser-playgrounds",
    setupFiles: ["./test/integration/shared/_setup.ts"],
    api: { port: 63319 },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
