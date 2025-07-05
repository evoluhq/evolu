import {
  createConsole,
  createEnglishMnemonic,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
} from "@evolu/common";

import {
  CreateAppState,
  CreateDbWorker,
  createDbWorkerForPlatform,
  EvoluDeps,
} from "@evolu/common/evolu";

import * as Expo from "expo";

import { createExpoSqliteDriver } from "./providers/ExpoSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";
import { createWebSocketSyncWithAppState } from "./WebSocketSyncWithAppState.js";

polyfillHermes();

export const createAppState: CreateAppState = () => ({
  reset: () => {
    void Expo.reloadAppAsync();
  },
});

const nanoIdLib = createNanoIdLib();
const console = createConsole();
const time = createTime();

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    createSqliteDriver: createExpoSqliteDriver,
    createSync: createWebSocketSyncWithAppState,
    console,
    time,
    random: createRandom(),
    nanoIdLib,
    createMnemonic: createEnglishMnemonic,
    createRandomBytes,
  });

export const evoluReactNativeDeps: EvoluDeps = {
  time,
  nanoIdLib,
  console,
  createAppState,
  createDbWorker,
};
