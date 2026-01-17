import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    projects: [
      {
        test: {
          snapshotSerializers: ["./test/local-first/_uint8ArraySerializer.ts"],
          include: ["test/**/*.test.ts"],
          name: "unit",
          environment: "node",
        },
      },
      // {
      //   test: {
      //     include: ["test/Task.test.ts"],
      //     name: "browser",
      //     browser: {
      //       enabled: true,
      //       provider: playwright(),
      //       headless: true,
      //       instances: [{ browser: "chromium" }],
      //     },
      //   },
      // },
    ],
  },
});
