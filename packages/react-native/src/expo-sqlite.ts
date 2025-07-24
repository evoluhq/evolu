import {
  createConsole,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
} from "@evolu/common";

import {
  CreateAppState,
  CreateDbWorker,
  createDbWorkerForPlatform,
  createWebSocketSync,
  EvoluDeps,
} from "@evolu/common/evolu";

import * as Expo from "expo";

import { createExpoSqliteDriver } from "./providers/ExpoSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";

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
    createSync: createWebSocketSync,
    console,
    time,
    random: createRandom(),
    nanoIdLib,
    createRandomBytes,
  });

export const evoluReactNativeDeps: EvoluDeps = {
  time,
  nanoIdLib,
  console,
  createAppState,
  createDbWorker,
};
