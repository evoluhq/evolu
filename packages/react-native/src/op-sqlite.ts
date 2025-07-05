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

import { DevSettings } from "react-native";
import { createOpSqliteDriver } from "./providers/OpSqliteDriver.js";
import { polyfillHermes } from "./utils/Hermes.js";
import { createWebSocketSyncWithAppState } from "./WebSocketSyncWithAppState.js";

polyfillHermes();

export const createAppState: CreateAppState = () => ({
  reset: () => {
    if (process.env.NODE_ENV === "development") {
      DevSettings.reload();
    } else {
      // TODO: reload not implemented for bare rn
    }
  },
});

const nanoIdLib = createNanoIdLib();
const console = createConsole();
const time = createTime();

const createDbWorker: CreateDbWorker = () =>
  createDbWorkerForPlatform({
    createSqliteDriver: createOpSqliteDriver,
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
