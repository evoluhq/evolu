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
  console: createConsole(),
  createRandomBytes,
  createSqliteDriver: createWasmSqliteDriver,
  createWebSocket,
  nanoIdLib: createNanoIdLib(),
  random: createRandom(),
  time: createTime(),
});

wrapWebWorkerSelf(dbWorker);
