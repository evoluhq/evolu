import {
  createConsole,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
  createWebSocket,
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

polyfillHermes();

export const createAppState: CreateAppState = () => ({
  reset: () => {
    void Expo.reloadAppAsync();
  },
});

const console = createConsole();
const nanoIdLib = createNanoIdLib();
const time = createTime();

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    console,
    createSqliteDriver: createExpoSqliteDriver,
    createWebSocket,
    nanoIdLib,
    random: createRandom(),
    randomBytes: createRandomBytes(),
    time,
  });

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createAppState,
  createDbWorker,
  nanoIdLib,
  time,
};
