/**
 * Public entry point for Expo SQLite. Exported as
 * "@evolu/react-native/expo-sqlite" in package.json.
 *
 * Use this with Expo projects that use expo-sqlite.
 */

import type { EvoluDeps } from "@evolu/common/local-first";
import * as Expo from "expo";
import { createEvoluDeps as createSharedEvoluDeps } from "../shared.js";

/** Creates Evolu dependencies for Expo. */
export const createEvoluDeps = (): EvoluDeps =>
  createSharedEvoluDeps({
    reloadApp: () => {
      void Expo.reloadAppAsync();
    },
  });

// import { createExpoDeps } from "../createExpoDeps.js";
// import { createExpoSqliteDriver } from "../sqlite-drivers/createExpoSqliteDriver.js";
//
// // eslint-disable-next-line evolu/require-pure-annotation
// export const { evoluReactNativeDeps, localAuth } = createExpoDeps({
//   createSqliteDriver: createExpoSqliteDriver,
// });
