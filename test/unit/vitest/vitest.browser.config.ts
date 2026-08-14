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

export default defineProject(({ mode }) => ({
  root: resolve(import.meta.dirname, "../../.."),
  cacheDir: resolve(
    import.meta.dirname,
    `../../../node_modules/.vite/browser-unit-${mode}`,
  ),
  plugins: [transformUsing],
  test: {
    snapshotSerializers: [
      "./test/unit/vitest/common/local-first/_uint8ArraySerializer.ts",
    ],
    include: ["test/unit/vitest/common/*.test.ts"],
    name: "browser-unit",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      api: { port: 63315 },
      headless: true,
      fileParallelism: false,
      instances:
        // V8 coverage only works with Chromium.
        process.argv.includes("--coverage")
          ? [{ browser: "chromium" }]
          : mode === "firefox-webkit"
            ? [{ browser: "firefox" }, { browser: "webkit" }]
            : [
                { browser: "chromium" },
                { browser: "firefox" },
                { browser: "webkit" },
              ],
    },
  },
}));
