import { defineConfig } from "vitest/config";
import webBrowser from "./packages/web/vitest.config.ts";
import commonIntegrationBrowser from "./test/integration/vitest/vitest.browser.config.ts";
import integrationNode from "./test/integration/vitest/vitest.node.config.ts";
import commonUnitBrowser from "./test/unit/vitest/vitest.browser.config.ts";
import unitNode from "./test/unit/vitest/vitest.node.config.ts";

const nodeProjects = [
  unitNode,
  integrationNode,
  "packages/react",
  "packages/react-native",
  {
    test: {
      name: "node-scripts",
      include: ["scripts/**/*.test.mts"],
    },
  },
  {
    test: {
      name: "node-bench",
      include: ["bench/**/*.test.mts"],
    },
  },
];

const browserProjects = [
  commonUnitBrowser,
  commonIntegrationBrowser,
  webBrowser,
];

const bundleProject = {
  test: {
    include: ["test/integration/vitest/{Bundle,TestBundle}/*.test.ts"],
    name: "bundle",
    environment: "node",
    setupFiles: ["./test/unit/vitest/common/_setup.ts"],
  },
};

export default defineConfig({
  test: {
    projects: [...nodeProjects, ...browserProjects, bundleProject],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/**/index.ts",
        "packages/common/src/intl/**/*.ts",
      ],
      reporter: ["text", "html"],
      // TODO: Enforce 100% coverage thresholds for every package.
    },
  },
});
