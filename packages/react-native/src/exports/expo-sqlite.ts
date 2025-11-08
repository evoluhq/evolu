/**
 * Public entry point for Expo SQLite. Exported as
 * "@evolu/react-native/expo-sqlite" in package.json.
 *
 * Use this with Expo projects that use expo-sqlite.
 */

import { createExpoDeps } from "../createExpoDeps.js";
import { createExpoSqliteDriver } from "../sqlite-drivers/createExpoSqliteDriver.js";

export const { evoluReactNativeDeps, localAuth } = createExpoDeps({
  createSqliteDriver: createExpoSqliteDriver,
});
