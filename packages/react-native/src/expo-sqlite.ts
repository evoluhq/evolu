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

import * as Expo from "expo";
import { createExpoSqliteDriver } from "./providers/ExpoSqliteDriver.js";
import { createSecureStore } from "./utils/LocalAuth.js";
//import { SensitiveInfo } from "react-native-sensitive-info";
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

const console = createConsole();
const time = createTime();
const randomBytes = createRandomBytes();
const localAuth = createLocalAuth({
  randomBytes: randomBytes,
  //secureStorage: SensitiveInfo,
  secureStorage: createSecureStore(),
});

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    console,
    createSqliteDriver: createExpoSqliteDriver,
    createWebSocket,
    random: createRandom(),
    randomBytes,
    time,
  });

const reloadApp: ReloadApp = () => {
  void Expo.reloadAppAsync();
};

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createDbWorker,
  randomBytes,
  localAuth,
  reloadApp,
  time,
};
