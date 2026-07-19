/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createRandomBytes } from "@evolu/common";
import { startDbWorker } from "@evolu/common/local-first";
import { createWasmSqliteDriver } from "../Sqlite.ts";
import { createRun } from "../Task.ts";
import { createWorkerDeps, createWorkerSelf } from "../Worker.ts";

const run = createRun({
  ...createWorkerDeps(),
  createSqliteDriver: createWasmSqliteDriver,
  lockManager: globalThis.navigator.locks,
  randomBytes: createRandomBytes(),
});

void run(startDbWorker(createWorkerSelf(self)));
