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
  createSqliteDriver: createWasmSqliteDriver,
  createWebSocket,
  nanoIdLib: createNanoIdLib(),
  random: createRandom(),
  randomBytes: createRandomBytes(),
  time: createTime(),
});

wrapWebWorkerSelf(dbWorker);
