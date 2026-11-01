import {
  trySync,
  type ConsoleDep,
  type DecryptWithXChaCha20Poly1305Error,
  type XChaCha20Poly1305Ciphertext,
} from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import { createEvoluDeps as createSharedEvoluDeps } from "./shared.ts";
import { createDeleteDatabaseFiles } from "./sqlite/DeleteDatabaseFiles.ts";
import { createReactNativeSqliteDriver } from "./sqlite/Driver.ts";
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
  const nativeSqlite = loadNativeSqlite();
  const sqliteDeps = {
    nativeSqlite,
    // The iOS container moves across app updates, so it's read at every start.
    databaseDirectory: evoluApp.getDatabaseDirectory(),
  };
  return createSharedEvoluDeps({
    ...deps,
    createSqliteDriver: createReactNativeSqliteDriver(sqliteDeps),
    waitForDatabaseRelease: createWaitForDatabaseRelease(sqliteDeps),
    deleteDatabaseFiles: createDeleteDatabaseFiles(sqliteDeps),
    reloadApp: () => {
      evoluApp.reloadApp();
    },
    // The binding's C, which decrypts a change far faster than noble-ciphers
    // in JavaScript. Its decrypt throws only when the tag doesn't
    // authenticate.
    xChaCha20Poly1305: {
      encrypt: (plaintext, nonce, encryptionKey) =>
        nativeSqlite.encryptXChaCha20Poly1305(
          encryptionKey,
          nonce,
          plaintext,
        ) as XChaCha20Poly1305Ciphertext,
      decrypt: (ciphertext, nonce, encryptionKey) =>
        trySync(
          () =>
            nativeSqlite.decryptXChaCha20Poly1305(
              encryptionKey,
              nonce,
              ciphertext,
            ),
          (error): DecryptWithXChaCha20Poly1305Error => ({
            type: "DecryptWithXChaCha20Poly1305Error",
            error,
          }),
        ),
    },
  });
};
