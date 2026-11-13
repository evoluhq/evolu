/**
 * The device runner's reload in two worker threads, as the old and the reloaded
 * JavaScript runtime of one app process: the old one keeps the marker open
 * across its reload, so the reloaded one opens it only once the old one's
 * teardown released it, and then logs only that it reloaded. A third, as the
 * process the driver restarts, checks the DeviceSecret.
 */
import { assertEqual, assertFalse, assertRejects } from "@evolu/common";
import {
  setupAddonPath,
  setupAddonTimeout,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import {
  deviceSecretAppName,
  deviceSecretCheck,
  deviceTestsMarker,
  deviceTestsTag,
} from "../device/suites.ts";

/** Runtimes of one app's processes, in worker threads. */
const setupRuntimes = async (t: TestContext) => {
  const addonPath = await setupAddonPath();
  const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-reload-"));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  const events: Array<string> = [];
  /**
   * Starts a runtime, whose `ready` resolves once it begins running the runner,
   * and `posted` once it posted `until`.
   */
  const start = (name: string, until: string) => {
    const worker = new Worker(new URL("reload-worker.ts", import.meta.url), {
      workerData: { addonPath, directory },
      execArgv: [
        "--experimental-test-module-mocks",
        "--disable-warning=ExperimentalWarning",
      ],
    });
    t.after(() => worker.terminate());
    const ready = Promise.withResolvers<void>();
    const posted = Promise.withResolvers<void>();
    worker.on("message", (line: string) => {
      events.push(`${name}: ${line}`);
      if (line === "ready") ready.resolve();
      if (line === until) posted.resolve();
      // A runtime that failed logs nothing more.
      if (line.startsWith(`${deviceTestsTag} failed:`))
        posted.reject(new Error(`${name}: ${line}`));
    });
    worker.on("error", (error) => {
      ready.reject(error);
      posted.reject(error);
    });
    return { worker, ready: ready.promise, posted: posted.promise };
  };

  /** Runs the device tests and reloads, as the device route does. */
  const runAndReload = async () => {
    const old = start("old", "reload");
    await old.posted;
    const reloaded = start("reloaded", `${deviceTestsTag} reloaded`);
    // The reloaded runtime waits for the marker meanwhile, however long its
    // worker took to start.
    await reloaded.ready;
    await setTimeout(300);
    events.push("old terminated");
    await old.worker.terminate();
    await reloaded.posted;
    await reloaded.worker.terminate();
  };

  return { directory, events, start, runAndReload };
};

test(
  "the reloaded runtime logs that it reloaded only after the old runtime's teardown released the marker, and the restarted one that it relaunched",
  { timeout: setupAddonTimeout },
  async (t) => {
    const { directory, events, start, runAndReload } = await setupRuntimes(t);

    await runAndReload();
    await start("relaunched", `${deviceTestsTag} relaunched`).posted;

    assertEqual(events, [
      "old: ready",
      `old: ${deviceTestsTag} passed=0 failed=0 total=0`,
      "old: reload",
      "reloaded: ready",
      "old terminated",
      `reloaded: ${deviceTestsTag} reloaded`,
      "relaunched: ready",
      `relaunched: ${deviceTestsTag} relaunched`,
    ]);
    for (const name of [deviceTestsMarker, deviceSecretCheck])
      assertFalse(existsSync(join(directory, `evolu1-${name}.db`)));
  },
);

test(
  "the restarted runtime fails when the platform didn't keep the DeviceSecret",
  { timeout: setupAddonTimeout },
  async (t) => {
    const { directory, start, runAndReload } = await setupRuntimes(t);

    await runAndReload();
    // As a platform that kept it only in memory.
    rmSync(join(directory, `secret-${deviceSecretAppName}`));
    await assertRejects(
      start("relaunched", `${deviceTestsTag} relaunched`).posted,
      (error) => {
        assertEqual(
          (error as Error).message.startsWith(
            `relaunched: ${deviceTestsTag} failed: runner:`,
          ),
          true,
        );
      },
    );
    assertEqual(
      readdirSync(directory).includes(`evolu1-${deviceSecretCheck}.db`),
      true,
    );
  },
);
