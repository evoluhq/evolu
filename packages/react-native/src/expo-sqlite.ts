import {
  createConsole,
  createRandom,
  createRandomBytes,
  createAuthProvider,
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
import { SensitiveInfo } from "react-native-sensitive-info";
import { createExpoSqliteDriver } from "./providers/ExpoSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

const console = createConsole();
const time = createTime();
const randomBytes = createRandomBytes();
const authProvider = createAuthProvider(SensitiveInfo, randomBytes);

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
  authProvider,
  reloadApp,
  time,
};
