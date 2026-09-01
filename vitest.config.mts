import { defineConfig } from "vitest/config";
import commonIntegrationBrowser from "./test/integration/browsers/vitest.config.ts";
import webBrowser from "./test/integration/browsers/web/vitest.config.ts";
import integrationNode from "./test/integration/nodejs/vitest.config.ts";

const nodeProjects = [integrationNode];

const browserProjects = [commonIntegrationBrowser, webBrowser];

const browserCoverageInclude = [
  "packages/common/src/{LockManager,Platform,Polyfills,StackTrace,Task,WebSocket}.ts",
  "packages/web/src/{Sqlite,Worker}.ts",
];

export default defineConfig(({ mode }) => ({
  test: {
    projects: [...nodeProjects, ...browserProjects],
    sequence: { shuffle: { files: false, tests: true } },
    coverage: {
      provider: "v8",
      include:
        mode === "chromium"
          ? browserCoverageInclude
          : ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/**/index.ts",
        "packages/common/src/intl/**/*.ts",
      ],
      reporter: ["text", "html"],
      // TODO: Enforce 100% coverage thresholds for every package.
    },
  },
}));
