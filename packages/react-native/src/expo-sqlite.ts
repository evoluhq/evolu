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
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

const console = createConsole();
const time = createTime();
const randomBytes = createRandomBytes();

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

export * from "./components/EvoluAvatar.js";

export const localAuth = createLocalAuth({
  randomBytes: randomBytes,
  secureStorage: createSecureStore(),
});

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createDbWorker,
  randomBytes,
  reloadApp,
  time,
};
