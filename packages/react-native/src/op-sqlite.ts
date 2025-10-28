import {
  createConsole,
  createLocalAuth,
  createRandom,
  createRandomBytes,
  createTime,
  createWebSocket,
} from "@evolu/common";

import {
  CreateDbWorker,
  createDbWorkerForPlatform,
  EvoluDeps,
  ReloadApp,
} from "@evolu/common/evolu";

import { DevSettings } from "react-native";
import { SensitiveInfo } from "react-native-sensitive-info";
import { createOpSqliteDriver } from "./providers/OpSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

const console = createConsole();
const time = createTime();
const randomBytes = createRandomBytes();
const localAuth = createLocalAuth({
  randomBytes: randomBytes,
  secureStorage: SensitiveInfo,
});

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    console,
    createSqliteDriver: createOpSqliteDriver,
    createWebSocket,
    random: createRandom(),
    randomBytes,
    time,
  });

const reloadApp: ReloadApp = () => {
  if (process.env.NODE_ENV === "development") {
    DevSettings.reload();
  } else {
    // TODO: reload not implemented for bare rn
  }
};

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createDbWorker,
  randomBytes,
  localAuth,
  reloadApp,
  time,
};
