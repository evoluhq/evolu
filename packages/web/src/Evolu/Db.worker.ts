import {
  createConsole,
  createNanoIdLib,
  createRandom,
  createRandomBytes,
  createTime,
} from "@evolu/common";
import {
  createDbWorkerForPlatform,
  createWebSocketSync,
} from "@evolu/common/evolu";
import { createWasmSqliteDriver } from "../WasmSqliteDriver.js";
import { wrapWebWorkerSelf } from "../WebWorker.js";

const dbWorker = createDbWorkerForPlatform({
  createSqliteDriver: createWasmSqliteDriver,
  createSync: createWebSocketSync,
  console: createConsole(),
  time: createTime(),
  random: createRandom(),
  nanoIdLib: createNanoIdLib(),
  createRandomBytes,
});

wrapWebWorkerSelf(dbWorker);
