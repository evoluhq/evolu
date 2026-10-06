import { defineConfig } from "playwright/test";
import type { E2eOptions } from "./fixtures.mts";
import config from "./playwright.config.mts";

export default defineConfig<E2eOptions>({
  ...config,
  use: {
    ...config.use,
    relayEntry: "apps/relay/src/index.ts",
  },
  webServer: {
    ...config.webServer,
    command:
      "node packages/sqlite-wasm/scripts/check-wasm.mts && pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3100",
    timeout: 120_000,
  },
});
