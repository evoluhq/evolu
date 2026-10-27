/**
 * Evolu's SQLite on the web: the TypeScript layer of `packages/sqlite-wasm`
 * over its wasm build of Evolu's SQLite core, with Database files on its
 * opfs-sahpool rewrite.
 *
 * Options:
 *
 * - `database`: `Pool` opens plain File databases on the pool. `EncryptedPool`
 *   opens EncryptedFile databases with `createEncryptedSqliteDatabase` and a
 *   raw key, which Evolu's codec encrypts in the wasm.
 *
 * A statement that runs once goes through `SqliteDatabase.run`, which prepares
 * it, runs it and finalizes it in one call.
 *
 * @module
 */

import {
  concatByteArrays,
  createRun,
  createRunDefaultDeps,
  EncryptionKey,
  getOrThrow,
  type NonNegativeInt,
  type SqliteValue,
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteDatabase,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import {
  OpfsName,
  openSahPool,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { createSqliteWasm } from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import type { BenchSyncApi, BenchValue } from "../../run.mts";
import { serveWebStack } from "../worker.mts";

installPolyfills();

const sqliteWasmUrl = new URL(
  "../../../../packages/sqlite-wasm/wasm/sqlite3.wasm",
  import.meta.url,
);

// A fixed key, so every run encrypts the same way.
const key = EncryptionKey.orThrow(
  new Uint8Array(32).map((_, index) => index + 1),
);

const readChunkSize = (1024 * 1024) as NonNegativeInt;

serveWebStack(async ({ directory, options: { database: databaseType } }) => {
  if (databaseType !== "Pool" && databaseType !== "EncryptedPool")
    throw new Error(`Unknown database type: ${databaseType}`);

  const response = await fetch(sqliteWasmUrl);
  if (!response.ok)
    throw new Error(
      `Cannot fetch ${sqliteWasmUrl.pathname} (${response.status}). Download it with pnpm sqlite-wasm:download in the repository root, or build it from source as packages/sqlite-wasm/README.md#the-webassembly describes.`,
    );
  const run = createRun({
    ...createRunDefaultDeps(),
    opfsRoot: navigator.storage,
    subtleCrypto: crypto.subtle,
  });
  const sqliteWasm = getOrThrow(await run(createSqliteWasm(response)));
  const deps = { ...run.deps, sqliteWasm };
  const pool = getOrThrow(
    await run(openSahPool({ directory: [OpfsName.orThrow(directory)] }), deps),
  );
  const pathOf = (name: string) => SqliteVfsPath.orThrow(`/${name}`);

  const open = async (name: string): Promise<SqliteDatabase> => {
    switch (databaseType) {
      case "Pool":
        return getOrThrow(
          createSqliteDatabase(deps)({
            type: "File",
            vfs: pool,
            path: pathOf(name),
          }),
        );
      case "EncryptedPool": {
        const { database, keyDerivation } = getOrThrow(
          await run(
            createEncryptedSqliteDatabase({
              type: "EncryptedFile",
              vfs: pool,
              path: pathOf(name),
              key,
            }),
            deps,
          ),
        );
        if (keyDerivation !== "Raw")
          throw new Error(`A new database opened with ${keyDerivation}.`);
        return database;
      }
    }
  };

  return {
    openDatabase: async (name) => {
      const database = await open(name);
      const api: BenchSyncApi = {
        type: "Sync",
        runOnce: (sql) => {
          getOrThrow(database.run(sql, []));
        },
        selectValue: (sql) => {
          const [row] = getOrThrow(database.run(sql, [])).rows;
          return row == null ? null : (Object.values(row)[0] ?? null);
        },
        prepare: (sql) => {
          const statement = getOrThrow(database.prepare(sql));
          // The workloads bind only finite numbers.
          const run = (parameters: ReadonlyArray<BenchValue>) =>
            getOrThrow(statement.run(parameters as ReadonlyArray<SqliteValue>));
          return {
            run: (parameters) => {
              run(parameters);
            },
            get: (parameters) => run(parameters).rows[0],
            all: (parameters) => run(parameters).rows,
            finalize: () => {
              statement[Symbol.dispose]();
            },
          };
        },
      };
      return {
        api,
        close: () => {
          database[Symbol.dispose]();
          return Promise.resolve();
        },
      };
    },
    readFile: (name) => {
      // The pool reads fewer bytes at the end of the file.
      const chunks: Array<Uint8Array> = [];
      for (let offset = 0; ; offset += readChunkSize) {
        const chunk = getOrThrow(
          pool.read(pathOf(name), offset as NonNegativeInt, readChunkSize),
        );
        chunks.push(chunk);
        if (chunk.length < readChunkSize) break;
      }
      return Promise.resolve(concatByteArrays(chunks));
    },
    deleteDatabase: (name) => {
      getOrThrow(pool.unlink(pathOf(name)));
      return Promise.resolve();
    },
    dispose: async () => {
      pool[Symbol.dispose]();
      await run[Symbol.asyncDispose]();
    },
  };
});
