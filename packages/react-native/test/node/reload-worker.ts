/**
 * A JavaScript runtime of the example app for `reload.test.ts`, which runs two
 * in worker threads, as an app process runs the old and the reloaded one. It
 * runs the device runner on the N-API mirror of the binding, with both specs
 * mocked and no suites, and posts each line the runner logs, and its reload.
 */
import {
  assertEqual,
  assertNonNullable,
  type NativeSqlite,
} from "@evolu/common";
import { loadAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { mock } from "node:test";
import { parentPort, workerData } from "node:worker_threads";

const { addonPath, directory } = workerData as {
  readonly addonPath: string;
  readonly directory: string;
};
const port = parentPort;
assertNonNullable(port);
const binding = loadAddon(addonPath).createBinding() as NativeSqlite;

mock.module(
  new URL("../../src/specs/NativeEvoluSqlite.ts", import.meta.url).href,
  { exports: { default: { createBinding: () => binding } } },
);
mock.module(
  new URL("../../src/specs/NativeEvoluApp.ts", import.meta.url).href,
  {
    exports: {
      default: {
        getDatabaseDirectory: () => directory,
        reloadApp: () => {
          port.postMessage("reload");
        },
      },
    },
  },
);
// Only the reload around the suites matters here.
const suitesUrl = new URL("../device/suites.ts", import.meta.url).href;
mock.module(suitesUrl, {
  exports: {
    ...((await import(suitesUrl)) as object),
    registerDeviceSuites: () => undefined,
  },
});
const { runDeviceTests } = await import("../device/runner.ts");

// A runtime lives until the test terminates it, as until React Native tears
// it down, which closes its connections.
port.on("message", () => undefined);
port.postMessage("ready");
await runDeviceTests({
  platform: "ios",
  assertEqual,
  createEvoluDeps: () => {
    throw new Error("No suites run.");
  },
  log: (line) => {
    port.postMessage(line);
  },
});
