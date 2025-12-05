/**
 * Public entry point for bare React Native with OP-SQLite. Exported as
 * "@evolu/react-native/bare-op-sqlite" in package.json.
 *
 * Use this with bare React Native projects (not Expo) that use
 * `@op-engineering/op-sqlite`.
 */

import { ReloadApp } from "@evolu/common";
import { DevSettings } from "react-native";
import { SensitiveInfo } from "react-native-sensitive-info";
import { createSharedEvoluDeps, createSharedLocalAuth } from "../shared.js";
import { createOpSqliteDriver } from "../sqlite-drivers/createOpSqliteDriver.js";

const reloadApp: ReloadApp = () => {
  if (process.env.NODE_ENV === "development") {
    DevSettings.reload();
  } else {
    // TODO: reload not implemented for bare rn
  }
};

export const evoluReactNativeDeps = createSharedEvoluDeps({
  createSqliteDriver: createOpSqliteDriver,
  reloadApp,
});

export const localAuth = createSharedLocalAuth(SensitiveInfo);
