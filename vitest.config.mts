import { defineConfig } from "vitest/config";
import commonIntegrationBrowser from "./test/integration/vitest/vitest.browser.config.ts";
import commonIntegrationNode from "./test/integration/vitest/vitest.node.config.ts";
import commonUnitBrowser from "./test/unit/vitest/vitest.browser.config.ts";
import unitNode from "./test/unit/vitest/vitest.node.config.ts";

export default defineConfig({
  test: {
    projects: [
      unitNode,
      commonUnitBrowser,
      commonIntegrationNode,
      commonIntegrationBrowser,
      "packages/web",
      "packages/nodejs",
      "packages/react",
      "packages/react-native",
      {
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.mts"],
        },
      },
      {
        test: {
          name: "bench",
          include: ["bench/**/*.test.mts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/index.ts"],
      reporter: ["text", "html"],
    },
  },
});
