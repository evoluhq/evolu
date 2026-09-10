import { resolve } from "node:path";
import type { PlaywrightTestConfig } from "playwright/test";
import type { E2eOptions } from "./fixtures.mts";

const baseURL = "http://127.0.0.1:3100";
export const relayUrl = "ws://127.0.0.1:4311";

const config = {
  testDir: import.meta.dirname,
  testMatch: "*.spec.mts",
  // Each test replaces the relay at the URL embedded in the Next.js bundle.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "../../test-results/e2e",
  reporter: [
    ["list"],
    ["html", { outputFolder: "../../playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    cwd: resolve(import.meta.dirname, "../.."),
    command:
      'pnpm --filter "web^..." --filter @evolu/relay -r run build && pnpm build:docs && pnpm --filter web run build && pnpm --filter web exec next start --hostname 127.0.0.1 --port 3100',
    env: { NEXT_PUBLIC_EVOLU_RELAY_URL: relayUrl },
    url: `${baseURL}/playgrounds/minimal`,
    reuseExistingServer: false,
    // The command also builds: show its output and allow for a cold CI runner.
    stdout: "pipe",
    timeout: 600_000,
  },
} satisfies PlaywrightTestConfig<E2eOptions>;

export default config;
