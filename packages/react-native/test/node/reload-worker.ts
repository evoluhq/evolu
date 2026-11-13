/**
 * A JavaScript runtime of the example app for `reload.test.ts`, which runs them
 * in worker threads, as an app process runs the old and the reloaded one, and a
 * restarted process another. It runs the device runner on the N-API mirror of
 * the binding, with both specs mocked and no suites, and posts each line the
 * runner logs, and its reload. Its secure storage keeps each DeviceSecret in a
 * file of the directory, so it outlives a runtime as the platform's does.
 */
import {
  assertEqual,
  assertNonNullable,
  type NativeSqlite,
} from "@evolu/common";
import { loadAddon } from "@evolu/sqlite-core/test/setup-addon.mts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
        getOrAddDeviceSecret: (appName: string, secret: string) => {
          const file = join(directory, `secret-${appName}`);
          if (!existsSync(file)) writeFileSync(file, secret);
          return Promise.resolve(readFileSync(file, "utf8"));
        },
      },
    },
  },
);
// Only the reload around the suites matters here, so neither the suites nor
// the EvoluApp the runner checks across the restart run.
const suitesUrl = new URL("../device/suites.ts", import.meta.url).href;
mock.module(suitesUrl, {
  exports: {
    ...((await import(suitesUrl)) as object),
    registerDeviceSuites: () => undefined,
    prepareDeviceEvoluAppRelaunch: () => Promise.resolve(),
    checkDeviceEvoluAppRelaunch: () => Promise.resolve(),
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
