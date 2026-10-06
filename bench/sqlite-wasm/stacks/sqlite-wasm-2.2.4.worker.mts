/**
 * `@evolu/sqlite-wasm` 2.2.4, which `@evolu/web` shipped until 3.4.1: SQLite's
 * own JavaScript and opfs-sahpool VFS (SQLite 3.50.4, SQLite3 Multiple Ciphers
 * 2.2.4), opened as `@evolu/web` 3.4.1 opens it.
 *
 * Options:
 *
 * - `database`: `Plain` opens unencrypted databases on the pool's VFS.
 *   `Encrypted` creates the `multipleciphers-` wrapper of the pool's VFS, opens
 *   databases through it and keys them with `PRAGMA cipher = 'sqlcipher'` and
 *   `PRAGMA key = "x'<hex>'"`, which SQLite3 Multiple Ciphers 2.2.4 takes as a
 *   passphrase.
 *
 * Workloads run through the C API's `sqlite3_exec`, not `oo1.DB.exec`. The
 * latter passes `sqlite3_prepare_v3` the length of the remaining SQL without
 * its terminating NUL, so SQLite copies all of the remaining SQL before
 * preparing each statement. In Chromium, that cost 2.6 µs per statement of a
 * 0.3 MB workload and 13 µs per statement of a 2 MB one. `@evolu/web` runs
 * prepared statements and short SQL, where the copy is negligible. SQLite
 * 3.53.4's `oo1` does the same.
 *
 * @module
 */

import { bytesToHex } from "@evolu/common";
import sqlite3InitModule from "@evolu/sqlite-wasm-2.2.4";
import { serveBenchStack } from "../worker.mts";

// A fixed key, so every run encrypts the same way.
const key = new Uint8Array(32).map((_, index) => index + 1);

serveBenchStack(async ({ directory, options: { database: databaseType } }) => {
  if (databaseType !== "Plain" && databaseType !== "Encrypted")
    throw new Error(`Unknown database type: ${databaseType}`);

  const sqlite3 = await sqlite3InitModule({
    // Cross-origin isolated, it also installs its "opfs" VFS, which the
    // benchmark does not use, and reports on it.
    print: () => undefined,
    printErr: () => undefined,
  });

  if (databaseType === "Encrypted") {
    // The types of 2.2.4 lack the functions of SQLite3 Multiple Ciphers.
    const { sqlite3mc_vfs_create } = sqlite3.capi as unknown as {
      readonly sqlite3mc_vfs_create: (
        vfs: string,
        makeDefault: number,
      ) => number;
    };
    sqlite3mc_vfs_create("opfs", 1);
  }
  // As `@evolu/web` does: a plain pool's VFS is named after the database, and
  // an encrypted one keeps the default name its wrapper refers to.
  const pool = await sqlite3.installOpfsSAHPoolVfs(
    databaseType === "Plain"
      ? { name: `bench-${directory}`, directory }
      : { directory },
  );
  const pathOf = (name: string) => `/${name}`;

  return {
    openDatabase: (name) => {
      const database =
        databaseType === "Plain"
          ? new pool.OpfsSAHPoolDb(`file:${name}`)
          : new pool.OpfsSAHPoolDb(
              `file:${name}?vfs=multipleciphers-opfs-sahpool`,
            );
      if (databaseType === "Encrypted")
        database.exec(`
          PRAGMA cipher = 'sqlcipher';
          PRAGMA key = "x'${bytesToHex(key)}'";
        `);
      return Promise.resolve({
        exec: (sql) => {
          const rc = sqlite3.capi.sqlite3_exec(database, sql, 0, 0, 0);
          if (rc !== sqlite3.capi.SQLITE_OK)
            throw new Error(
              `sqlite3_exec failed with ${rc}: ${sqlite3.capi.sqlite3_errmsg(database)}`,
            );
        },
        selectValue: (sql) => Promise.resolve(database.selectValue(sql)),
        close: () => {
          database.close();
          return Promise.resolve();
        },
      });
    },
    readFile: (name) => pool.exportFile(pathOf(name)),
    deleteDatabase: (name) => {
      if (!pool.unlink(pathOf(name)))
        throw new Error(`The pool has no ${pathOf(name)}.`);
      return Promise.resolve();
    },
    dispose: () => {
      pool.pauseVfs();
      return Promise.resolve();
    },
  };
});
