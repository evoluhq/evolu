/**
 * Public entry point for Expo SQLite. Exported as
 * "@evolu/react-native/expo-sqlite" in package.json.
 *
 * Use this with Expo projects that use expo-sqlite.
 */

import type { ConsoleDep } from "@evolu/common";
import type { EvoluDeps } from "@evolu/common/local-first";
import * as Expo from "expo";
import { createEvoluDeps as createSharedEvoluDeps } from "../shared.ts";
import { createExpoSqliteDriver } from "../sqlite-drivers/createExpoSqliteDriver.ts";

/** Creates Evolu dependencies for Expo. */
export const createEvoluDeps = (deps: Partial<ConsoleDep> = {}): EvoluDeps =>
  createSharedEvoluDeps({
    ...deps,
    createSqliteDriver: createExpoSqliteDriver,
    reloadApp: () => {
      void Expo.reloadAppAsync();
    },
  });

// import { createExpoDeps } from "../createExpoDeps.ts";
// import { createExpoSqliteDriver } from "../sqlite-drivers/createExpoSqliteDriver.ts";
//
// // eslint-disable-next-line evolu/require-pure-annotation
// export const { evoluReactNativeDeps, localAuth } = createExpoDeps({
//   createSqliteDriver: createExpoSqliteDriver,
// });
