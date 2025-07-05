import {
  createConsole,
  createEnglishMnemonic,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
} from "@evolu/common";
import { createDbWorkerForPlatform } from "@evolu/common/evolu";
import { createWasmSqliteDriver } from "../WasmSqliteDriver.js";
import { wrapWebWorkerSelf } from "../WebWorker.js";
import { createWebSocketSyncWithVisibility } from "./WebSocketSyncWithVisibility.js";

const dbWorker = createDbWorkerForPlatform({
  createSqliteDriver: createWasmSqliteDriver,
  createSync: createWebSocketSyncWithVisibility,
  console: createConsole(),
  time: createTime(),
  random: createRandom(),
  nanoIdLib: createNanoIdLib(),
  createMnemonic: createEnglishMnemonic,
  createRandomBytes,
});

wrapWebWorkerSelf(dbWorker);
