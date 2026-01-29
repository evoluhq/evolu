/**
 * Public entry point for Expo with OP-SQLite. Exported as
 * "@evolu/react-native/expo-op-sqlite" in package.json.
 *
 * Use this with Expo projects that use `@op-engineering/op-sqlite` for better
 * performance.
 */

import { createExpoDeps } from "../createExpoDeps.js";
import { createOpSqliteDriver } from "../sqlite-drivers/createOpSqliteDriver.js";

// eslint-disable-next-line evolu/require-pure-annotation
export const { evoluReactNativeDeps, localAuth } = createExpoDeps({
  createSqliteDriver: createOpSqliteDriver,
});
