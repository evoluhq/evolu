import { resolve } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { transformWithEsbuild } from "vite";
import { defineProject } from "vitest/config";
import { createBrowserInstances } from "@evolu/vitest/BrowserConfig";

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
  server: {
    forwardConsole: {
      unhandledErrors: false,
      logLevels: ["error", "warn"],
    },
  },
  plugins: [transformUsing],
  test: {
    fileParallelism: false,
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
      instances: createBrowserInstances({
        coverage: process.argv.includes("--coverage"),
        mode,
      }),
    },
  },
}));
