/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createRandomBytes } from "@evolu/common";
import { startDbWorker } from "@evolu/common/local-first";
import { createWasmSqliteDriver } from "../Sqlite.js";
import { createRun } from "../Task.js";
import { createWorkerDeps, createWorkerSelf } from "../Worker.js";

// TODO: Disposal.
const run = createRun({
  ...createWorkerDeps(),
  createSqliteDriver: createWasmSqliteDriver,
  lockManager: globalThis.navigator.locks,
  randomBytes: createRandomBytes(),
});

run(startDbWorker(createWorkerSelf(self)));
