import type { ConsoleDep } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createSharedEvoluDeps } from "./shared.ts";
import { createNativeSqliteDriver } from "./sqlite/Driver.ts";
import { loadEvoluApp, loadNativeSqlite } from "./sqlite/Loader.ts";
import { createWaitForDatabaseRelease } from "./sqlite/WaitForDatabaseRelease.ts";

/**
 * Creates Evolu dependencies for React Native, in Expo apps and in React Native
 * apps without Expo alike.
 *
 * Evolu runs SQLite in its own native code, which encrypts every database, so
 * the app needs a native build with `@evolu/react-native`: Expo Go can't load
 * it, and an over-the-air update can't add it to a build made without it. The
 * databases expo-sqlite's SQLCipher wrote for earlier releases open in place.
 * Install the polyfills of `@evolu/react-native/polyfills` first, from a module
 * the app's entry file imports first.
 */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps => {
  const evoluApp = loadEvoluApp();
  const sqliteDeps = {
    nativeSqlite: loadNativeSqlite(),
    // The iOS container moves across app updates, so it's read at every start.
    databaseDirectory: evoluApp.getDatabaseDirectory(),
  };
  return createSharedEvoluDeps({
    ...deps,
    createSqliteDriver: createNativeSqliteDriver(sqliteDeps),
    waitForDatabaseRelease: createWaitForDatabaseRelease(sqliteDeps),
    reloadApp: () => {
      evoluApp.reloadApp();
    },
  });
};
