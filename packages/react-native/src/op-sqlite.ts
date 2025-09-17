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

import { DevSettings } from "react-native";
import { createOpSqliteDriver } from "./providers/OpSqliteDriver.js";
import { createReactNativeScheduler } from "./Scheduler.js";
import { polyfillHermes } from "./utils/Hermes.js";

polyfillHermes();

const console = createConsole();
const nanoIdLib = createNanoIdLib();
const time = createTime();

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    console,
    createSqliteDriver: createOpSqliteDriver,
    createWebSocket,
    nanoIdLib,
    random: createRandom(),
    randomBytes: createRandomBytes(),
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
  nanoIdLib,
  reloadApp,
  scheduler: createReactNativeScheduler(),
  time,
};
