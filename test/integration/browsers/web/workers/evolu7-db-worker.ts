/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope;

import {
  createConsole,
  createRandom,
  createRandomBytes,
  createTime,
  createWebSocket,
  type CreateSqliteDriver,
  type SqliteRow,
} from "@evolu/common-7.4.1";
import { createDbWorkerForPlatform } from "@evolu/common-7.4.1/local-first";
import sqlite3InitModule from "@evolu/sqlite-wasm-2.2.4";

// Evolu 7's DbWorker, as the `Db.worker.js` of `@evolu/web` 2.4.0: the
// published `@evolu/common` 7.4.1 over `@evolu/sqlite-wasm` 2.2.4 in OPFS.

/** As `createWasmSqliteDriver` of `@evolu/web` 2.4.0 opens a stored database. */
const createSqliteDriver: CreateSqliteDriver = async (name) => {
  const sqlite3 = await sqlite3InitModule();
  (
    sqlite3.capi as unknown as {
      readonly sqlite3mc_vfs_create: (
        vfsName: string,
        makeDefault: number,
      ) => number;
    }
  ).sqlite3mc_vfs_create("opfs", 1);
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name });
  const db = new pool.OpfsSAHPoolDb("file:evolu1.db");
  return {
    exec: (query) => ({
      rows: db.exec(query.sql, {
        returnValue: "resultRows",
        rowMode: "object",
        bind: query.parameters,
      }) as ReadonlyArray<SqliteRow>,
      changes: db.changes(),
    }),
    export: () => sqlite3.capi.sqlite3_js_db_export(db),
    [Symbol.dispose]: () => {
      db.close();
    },
  };
};

const dbWorker = createDbWorkerForPlatform({
  console: createConsole(),
  createSqliteDriver,
  createWebSocket,
  random: createRandom(),
  randomBytes: createRandomBytes(),
  time: createTime(),
});

dbWorker.onMessage((message) => {
  self.postMessage(message);
});
self.addEventListener("message", (event) => {
  dbWorker.postMessage(event.data as never);
});
