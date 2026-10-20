/**
 * `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose opfs-sahpool rewrite
 * encrypts pages in TypeScript, the codec Evolu's own SQLite core replaced.
 *
 * Options:
 *
 * - `database`: `Pool` opens unencrypted File databases on the pool.
 *   `EncryptedPool` opens EncryptedFile databases on it with
 *   `createEncryptedSqliteDatabase` and a raw key, which the pool's TypeScript
 *   codec encrypts in the format of SQLite3 Multiple Ciphers' `sqlcipher`
 *   scheme, the format Evolu's codec writes.
 *
 * The benchmark reads files with `SahPool.read`, which returns the bytes as
 * stored, so its check that an encrypted file holds no plaintext reads the
 * ciphertext the codec wrote.
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
} from "@evolu/common";
import { installPolyfills } from "@evolu/common/polyfills";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  createSqliteWasm,
  OpfsName,
  openSahPool,
  SqliteVfsPath,
  sqliteWasmUrl,
  type SqliteDatabase,
} from "@evolu/sqlite-wasm-3.54.0-build2";
import { serveBenchStack } from "../worker.mts";

installPolyfills();

// A fixed key, so every run encrypts the same way.
const key = EncryptionKey.orThrow(
  new Uint8Array(32).map((_, index) => index + 1),
);

const readChunkSize = (1024 * 1024) as NonNegativeInt;

serveBenchStack(async ({ directory, options: { database: databaseType } }) => {
  if (databaseType !== "Pool" && databaseType !== "EncryptedPool")
    throw new Error(`Unknown database type: ${databaseType}`);

  const response = await fetch(sqliteWasmUrl);
  if (!response.ok)
    throw new Error(
      `Cannot fetch ${sqliteWasmUrl.pathname} (${response.status}). Install the dependencies with pnpm install in the repository root.`,
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
      return {
        exec: (sql) => {
          getOrThrow(database.exec(sql));
        },
        selectValue: (sql) => {
          const [row] = getOrThrow(database.run(sql, [])).rows;
          return Promise.resolve(row == null ? null : Object.values(row)[0]);
        },
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
