/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import { installPolyfills } from "@evolu/common/polyfills";
installPolyfills();

import { createRandomBytes } from "@evolu/common";
import { startDbWorker } from "@evolu/common/local-first";
import {
  createDeleteDatabaseFiles,
  createWaitForDatabaseRelease,
  createWasmSqliteDriver,
  loadSqliteWasm,
} from "../Sqlite.ts";
import { createRun } from "../Task.ts";
import { createWorkerDeps, createWorkerSelf } from "../Worker.ts";

const run = createRun({
  ...createWorkerDeps(),
  lockManager: navigator.locks,
  randomBytes: createRandomBytes(),
});

const sqliteDeps = {
  opfsRoot: navigator.storage,
  // SQLite loads while the DbWorker waits for its database.
  sqliteWasmLoad: run(loadSqliteWasm),
  subtleCrypto: crypto.subtle,
};

void run(startDbWorker(createWorkerSelf(self)), {
  ...run.deps,
  createSqliteDriver: createWasmSqliteDriver(sqliteDeps),
  deleteDatabaseFiles: createDeleteDatabaseFiles(sqliteDeps),
  waitForDatabaseRelease: createWaitForDatabaseRelease(sqliteDeps),
});

// Tells the tab that this script has loaded, so it posts the init; see
// createEvoluDeps.
self.postMessage(null);
