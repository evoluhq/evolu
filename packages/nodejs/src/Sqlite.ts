import {
  createNativeSqliteDriver,
  emptyPrototype,
  type CreateSqliteDriver,
  type NativeSqlite,
} from "@evolu/common";
import { resolve } from "node:path";
import { loadNativeSqlite } from "./NativeSqlite.ts";

/**
 * The {@link CreateSqliteDriver} of Evolu for Node.js, on Evolu's SQLite core,
 * which `@evolu/nodejs` ships prebuilt for macOS 13.5 or later and for Linux
 * with glibc 2.28 or later or with musl, each on arm64 and x64. An open on
 * another platform, such as Windows, throws.
 *
 * It stores a database in the file `<name>.db`, relative to the working
 * directory at the open. The `encrypted` mode encrypts it with the encryption
 * key, in the codec the web and React Native encrypt with, and its open of a
 * file another key wrote or a plaintext file, such as one an earlier
 * `@evolu/nodejs` wrote, fails with `SQLITE_NOTADB`, or, when a crash left a
 * hot journal, `SQLITE_NOTADB` or `SQLITE_CORRUPT`, and `SQLITE_CANTOPEN` when
 * it left a WAL log. The file keeps every committed row and its journal or log,
 * though the open drops the pages a crashed transaction appended, as its
 * rollback would. The mode without options stores it in plaintext, as the Evolu
 * Relay does. The `memory` mode stores no file.
 *
 * A file connection waits up to 5 seconds for a lock another process holds, and
 * one connection of the process holds a file at a time, so an open of a file
 * another connection holds tries again for up to 10 seconds. Bundle
 * `@evolu/nodejs` as an external, so its SQLite addon loads from the package.
 */
export const createNodeJsSqliteDriver: CreateSqliteDriver =
  (name, options) => (run) =>
    run(
      createNativeSqliteDriver({
        nativeSqlite: (nativeSqlite ??= loadNativeSqlite({
          rowPrototype: emptyPrototype,
        })),
        databasePath: (databaseName) => resolve(`${databaseName}.db`),
      })(name, options),
    );

// Loaded at the first open, once per thread, which also reads the C library.
let nativeSqlite: NativeSqlite | null = null;
