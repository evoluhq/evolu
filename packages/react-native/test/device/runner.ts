/**
 * Runs the device suites of `suites.ts` in an example app opened at its
 * `native-tests` URL, for `scripts/device-tests.mts`, which reads what it
 * logs.
 *
 * - It runs every test in turn and logs each failure on a line of its own, then
 *   one line with the passed, failed and total counts.
 * - Then it encrypts a database with the DeviceSecret it loads, leaves a marker
 *   next to the databases, a database it keeps open, and reloads the app from a
 *   timer, since a reload requested while the JS thread commits a render can
 *   crash React Native 0.88 on iOS. The reloaded app starts at the same URL,
 *   waits until the old runtime's teardown releases the marker, marks the
 *   restart in it, logs that it reloaded and runs nothing else. So every run
 *   tests `reloadApp`, and that the reloaded runtime opens the marker only once
 *   the old one released it.
 * - Before the reload, it also creates an EvoluApp whose device database the
 *   DeviceSecret encrypts, with two AppOwners, and on Android stores the
 *   DeviceSecrets whose records the driver then cuts short.
 * - The driver then stops the app's process and opens it again, and the app opens
 *   the encrypted database with the DeviceSecret it loads now, which fails
 *   unless the platform's secure storage kept the same one, deletes both
 *   databases, opens that EvoluApp again, which must still list its AppOwners,
 *   removes them, on Android finds the cut records unreadable until it forgets
 *   them, and logs that it relaunched.
 *
 * It runs only inside the repository, which the examples import it from by a
 * relative path.
 *
 * @module
 */
import { createRun, EncryptionKey, Name, sql } from "@evolu/common";
import { AppName } from "@evolu/common/local-first";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createReactNativeSqliteDriver } from "../../src/sqlite/Driver.ts";
import { loadEvoluApp, loadNativeSqlite } from "../../src/sqlite/Loader.ts";
import { createWaitForDatabaseRelease } from "../../src/sqlite/WaitForDatabaseRelease.ts";
import {
  forgetDeviceSecret,
  loadDeviceSecret,
} from "../../src/DeviceSecret.ts";
import {
  checkDeviceEvoluAppRelaunch,
  checkDeviceSecretRelaunch,
  deviceSecretAppName,
  deviceSecretCheck,
  deviceTestsMarker,
  deviceTestsTag,
  prepareDeviceEvoluAppRelaunch,
  prepareDeviceSecretRelaunch,
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
    const evoluAppDeps = {
      ...sqliteDeps,
      createEvoluDeps,
      loadDeviceSecret,
      forgetDeviceSecret,
    };
    const marker = Name.orThrow(deviceTestsMarker);
    // A failure rejects, so the Run reports no defect, which an app would show
    // as a crash, as the suites' runs do.
    const run = createRun({ reportDefect: () => undefined });

    const openSecretCheck = async () =>
      run.ok(
        createReactNativeSqliteDriver(sqliteDeps)(
          Name.orThrow(deviceSecretCheck),
          {
            mode: "encrypted",
            encryptionKey: EncryptionKey.orThrow(
              await run.orThrow(
                loadDeviceSecret(AppName.orThrow(deviceSecretAppName)),
              ),
            ),
          },
        ),
      );

    await run.orThrow(createWaitForDatabaseRelease(sqliteDeps)(marker));
    const found = await run.ok(
      createReactNativeSqliteDriver(sqliteDeps)(marker),
    );
    const [{ phase }] = found.exec(sql`
      select max(name) as phase
      from sqlite_schema
      where name in ('reload', 'relaunch');
    `).rows;
    if (phase === "reload") {
      found.exec(sql`drop table reload;`);
      found.exec(sql`create table relaunch (a);`);
      found[Symbol.dispose]();
      log(`${deviceTestsTag} reloaded`);
      return;
    }
    found.deleteDatabase();
    if (phase === "relaunch") {
      // A different DeviceSecret is another key, which fails the open.
      const check = await openSecretCheck();
      check.exec(sql`select count(*) from checked;`);
      check.deleteDatabase();
      await checkDeviceEvoluAppRelaunch(evoluAppDeps);
      if (platform === "android") await checkDeviceSecretRelaunch(evoluAppDeps);
      log(`${deviceTestsTag} relaunched`);
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
      loadDeviceSecret,
      forgetDeviceSecret,
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

    const check = await openSecretCheck();
    check.exec(sql`create table checked (a);`);
    check[Symbol.dispose]();
    await prepareDeviceEvoluAppRelaunch(evoluAppDeps);
    if (platform === "android") await prepareDeviceSecretRelaunch(evoluAppDeps);

    // Kept open, so the reloaded runtime waits for the old one's teardown.
    const next = await run.ok(
      createReactNativeSqliteDriver(sqliteDeps)(marker),
    );
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
