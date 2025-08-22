import {
  createConsole,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
  createWebSocket,
} from "@evolu/common";
import { createDbWorkerForPlatform } from "@evolu/common/evolu";
import { createWasmSqliteDriver } from "../WasmSqliteDriver.js";
import { wrapWebWorkerSelf } from "../WebWorker.js";

const dbWorker = createDbWorkerForPlatform({
  createSqliteDriver: createWasmSqliteDriver,
  createWebSocket,
  console: createConsole(),
  time: createTime(),
  random: createRandom(),
  nanoIdLib: createNanoIdLib(),
  createRandomBytes,
});

wrapWebWorkerSelf(dbWorker);
