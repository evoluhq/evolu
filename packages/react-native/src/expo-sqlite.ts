import {
  createConsole,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
  createWebSocket,
} from "@evolu/common";

import {
  ReloadApp,
  CreateDbWorker,
  createDbWorkerForPlatform,
  EvoluDeps,
} from "@evolu/common/evolu";

import * as Expo from "expo";

import { createExpoSqliteDriver } from "./providers/ExpoSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

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

const reloadApp: ReloadApp = () => {
  void Expo.reloadAppAsync();
};

export const evoluReactNativeDeps: EvoluDeps = {
  console,
  createDbWorker,
  nanoIdLib,
  reloadApp,
  time,
};
