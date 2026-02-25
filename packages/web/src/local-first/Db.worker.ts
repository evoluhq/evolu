/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { initDbWorker } from "@evolu/common/local-first";
import { createWasmSqliteDriver } from "../Sqlite.js";
import { createLeaderLock, createRun } from "../Task.js";
import { createWorkerDeps, createWorkerSelf } from "../Worker.js";

// TODO: Disposal.
const run = createRun({
  ...createWorkerDeps(),
  createSqliteDriver: createWasmSqliteDriver,
  leaderLock: createLeaderLock(),
});

run(initDbWorker(createWorkerSelf(self)));
