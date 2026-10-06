import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";
import { defineProject } from "vitest/config";
import { checkSqliteWasm } from "../../_checkSqliteWasm.ts";

// WebKit OPFS sync access handles fail in Playwright's ephemeral context. A
// profile of its own, because a Firefox preference limits the quota of the
// whole browser.
const userDataDir = resolve(
  import.meta.dirname,
  "../../../../../node_modules/.cache/vitest-playwright-user-data-sqlite-wasm-quota",
);

// Firefox reads the limit only at startup, while Playwright passes
// firefoxUserPrefs to a persistent context once Firefox runs
// (https://github.com/microsoft/playwright/issues/17442), so a new profile
// would get the limit only from its second launch. Firefox reads user.js at
// every startup. The limit is in KiB, and an origin's group gets a fifth of
// it, but at least 10 MiB and at most the limit, so 10 MiB here.
mkdirSync(userDataDir, { recursive: true });
writeFileSync(
  join(userDataDir, "user.js"),
  'user_pref("dom.quotaManager.temporaryStorage.fixedLimit", 10240);\n',
);

/**
 * The storage-quota tests of `@evolu/sqlite-wasm`, apart from the other browser
 * tests because of the Firefox limit.
 */
export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../../../node_modules/.vite/browser-sqlite-wasm-quota-${mode}`,
  ),
  // Target ES2025 so Vite lowers ES2026 `using`/`await using` for WebKit.
  oxc: {
    target: "es2025",
  },
  plugins: [checkSqliteWasm],
  test: {
    fileParallelism: false,
    include: ["test/integration/browsers/sqlite-wasm/quota/*.test.ts"],
    name: "browser-sqlite-wasm-quota",
    setupFiles: ["./test/integration/browsers/sqlite-wasm/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright({ persistentContext: userDataDir }),
      api: { port: 63320 },
      headless: true,
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
