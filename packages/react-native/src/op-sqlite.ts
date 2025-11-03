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

export * from "./components/EvoluAvatar.js";

export const localAuth = createLocalAuth({
  randomBytes: randomBytes,
  secureStorage: SensitiveInfo,
});

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createDbWorker,
  randomBytes,
  reloadApp,
  time,
};
