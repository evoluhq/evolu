/**
 * The device runner's reload in two worker threads, as the old and the reloaded
 * JavaScript runtime of one app process: the old one keeps the marker open
 * across its reload, so the reloaded one opens it only once the old one's
 * teardown released it, and then logs only that it reloaded.
 */
import { assertEqual, assertFalse } from "@evolu/common";
import {
  setupAddonPath,
  setupAddonTimeout,
} from "@evolu/sqlite-core/test/setup-addon.mts";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import { deviceTestsMarker, deviceTestsTag } from "../device/suites.ts";

test(
  "the reloaded runtime logs that it reloaded only after the old runtime's teardown released the marker",
  { timeout: setupAddonTimeout },
  async (t) => {
    const addonPath = await setupAddonPath();
    const directory = mkdtempSync(join(tmpdir(), "evolu-react-native-reload-"));
    t.after(() => {
      rmSync(directory, { recursive: true, force: true });
    });
    const events: Array<string> = [];
    /**
     * Starts a runtime, whose `ready` resolves once it begins running the
     * runner, and `posted` once it posted `until`.
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

    assertEqual(events, [
      "old: ready",
      `old: ${deviceTestsTag} passed=0 failed=0 total=0`,
      "old: reload",
      "reloaded: ready",
      "old terminated",
      `reloaded: ${deviceTestsTag} reloaded`,
    ]);
    assertFalse(existsSync(join(directory, `evolu1-${deviceTestsMarker}.db`)));
  },
);
