import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/common/vitest.unit.config.ts",
      "packages/common/vitest.browser.config.ts",
      "packages/web",
      "packages/nodejs",
      "packages/react-native",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/index.ts"],
      reporter: ["text", "html"],
    },
  },
});
