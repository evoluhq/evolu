/**
 * Runs the device suites of `suites.ts` in an example app opened at its
 * `native-tests` URL, for `scripts/device-tests.mts`, which reads what it
 * logs.
 *
 * - It runs every test in turn and logs each failure on a line of its own, then
 *   one line with the passed, failed and total counts.
 * - Then it leaves a marker next to the databases, a database it keeps open, and
 *   reloads the app from a timer, since a reload requested while the JS thread
 *   commits a render can crash React Native 0.88 on iOS. The reloaded app
 *   starts at the same URL, waits until the old runtime's teardown releases the
 *   marker, deletes it, logs that it reloaded and runs nothing else. So every
 *   run tests `reloadApp`, and that the reloaded runtime opens the marker only
 *   once the old one released it.
 *
 * It runs only inside the repository, which the examples import it from by a
 * relative path.
 *
 * @module
 */
import { createRun, Name, sql } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import { loadEvoluApp, loadNativeSqlite } from "../../src/sqlite/Loader.ts";
import { createWaitForDatabaseRelease } from "../../src/sqlite/WaitForDatabaseRelease.ts";
import {
  deviceTestsMarker,
  deviceTestsTag,
  registerDeviceSuites,
  type DevicePlatform,
} from "./suites.ts";

/** Runs the device suites, or, after their reload, logs that it reloaded. */
export const runDeviceTests = async ({
  platform,
  assertEqual,
  createEvoluDeps,
  log = (line) => {
    // oxlint-disable-next-line eslint/no-console -- The driver reads the app's log.
    console.log(line);
  },
}: {
  platform: DevicePlatform;
  assertEqual: (actual: unknown, expected: unknown) => void;
  /** The main entry's `createEvoluDeps`, which the app imports as any app does. */
  createEvoluDeps: () => EvoluDeps;
  log?: (line: string) => void;
}): Promise<void> => {
  // A failure outside any test, such as a reload whose wait failed, reaches the
  // driver as a line of its own, which it prints with its result.
  try {
    const nativeSqlite = loadNativeSqlite();
    const evoluApp = loadEvoluApp();
    const databaseDirectory = evoluApp.getDatabaseDirectory();
    const sqliteDeps = { nativeSqlite, databaseDirectory };
    const marker = Name.orThrow(deviceTestsMarker);
    // A failure rejects, so the Run reports no defect, which an app would show
    // as a crash, as the suites' runs do.
    const run = createRun({ reportDefect: () => undefined });

    await run.orThrow(createWaitForDatabaseRelease(sqliteDeps)(marker));
    const found = await run.ok(createNativeSqliteDriver(sqliteDeps)(marker));
    const [{ reloads }] = found.exec(sql`
      select count(*) as reloads from sqlite_schema where name = 'reload';
    `).rows;
    found.deleteDatabase();
    if (reloads === 1) {
      log(`${deviceTestsTag} reloaded`);
      return;
    }

    const random = new Uint8Array(8);
    nativeSqlite.fillRandom(random);
    const tests: Array<{
      readonly name: string;
      readonly fn: () => void | Promise<void>;
    }> = [];
    registerDeviceSuites({
      platform,
      nativeSqlite,
      databaseDirectory,
      directory: `${databaseDirectory}/native-tests-${Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
      test: (name, fn) => tests.push({ name, fn }),
      assertEqual,
      createEvoluDeps,
    });
    let failed = 0;
    for (const { name, fn } of tests)
      try {
        await fn();
      } catch (error) {
        failed++;
        log(
          `${deviceTestsTag} failed: ${name}: ${describeFailure(error).replaceAll("\n", " ")}`,
        );
      }
    log(
      `${deviceTestsTag} passed=${tests.length - failed} failed=${failed} total=${tests.length}`,
    );

    // Kept open, so the reloaded runtime waits for the old one's teardown.
    const next = await run.ok(createNativeSqliteDriver(sqliteDeps)(marker));
    next.exec(sql`create table reload (a);`);
    setTimeout(() => {
      evoluApp.reloadApp();
    }, 500);
  } catch (error) {
    log(
      `${deviceTestsTag} failed: runner: ${describeFailure(error).replaceAll("\n", " ")}`,
    );
  }
};

/** An Error's message, or a Run's panic's defect's, or the value as JSON. */
const describeFailure = (error: unknown): string => {
  const defect = (error as { readonly reason?: { readonly defect?: unknown } })
    ?.reason?.defect;
  if (defect !== undefined) return describeFailure(defect);
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
};
