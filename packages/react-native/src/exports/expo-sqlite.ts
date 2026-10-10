/**
 * Public entry point for Expo SQLite. Exported as
 * "@evolu/react-native/expo-sqlite" in package.json.
 *
 * Use this with Expo projects and existing React Native projects configured
 * with Expo modules.
 */

import type { ConsoleDep } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import * as Expo from "expo";
import { createEvoluDeps as createSharedEvoluDeps } from "../shared.ts";
import { createExpoSqliteDriver } from "../sqlite-drivers/createExpoSqliteDriver.ts";

/**
 * Creates Evolu dependencies for Expo.
 *
 * Evolu encrypts the database with SQLCipher and fails at startup when
 * `expo-sqlite` was built without it. Enable it with `"useSQLCipher": true` in
 * the `expo-sqlite` config plugin, as
 * [Privacy](https://www.evolu.dev/docs/privacy#encryption-on-the-device)
 * describes.
 */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps =>
  createSharedEvoluDeps({
    ...deps,
    createSqliteDriver: createExpoSqliteDriver,
    reloadApp: () => {
      void Expo.reloadAppAsync();
    },
  });
