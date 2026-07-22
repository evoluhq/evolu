import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";

// Transpile `using`/`await using` for WebKit which doesn't support it yet.
const transformUsing = {
  name: "transform-using",
  enforce: "pre" as const,
  transform: (code: string, id: string) =>
    code.includes("using ")
      ? transformWithEsbuild(code, id, {
          supported: { using: false },
        })
      : undefined,
};

// Coverage with v8 only works with a single browser instance. The VS Code
// Vitest extension enables coverage internally instead of passing --coverage,
// so extension runs need the same browser setup.
const isSingleBrowserRun =
  process.argv.includes("--coverage") || process.env.VITEST_VSCODE === "true";

export default defineProject({
  root: resolve(import.meta.dirname, "../../.."),
  plugins: [transformUsing],
  test: {
    snapshotSerializers: [
      "./test/unit/vitest/common/local-first/_uint8ArraySerializer.ts",
    ],
    include: ["test/unit/vitest/common/*.test.ts"],
    name: "@evolu/common unit (browser)",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      fileParallelism: false,
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
