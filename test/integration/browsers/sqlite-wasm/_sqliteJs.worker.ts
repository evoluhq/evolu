/**
 * A module worker running SQLite's own JavaScript and its opfs-sahpool VFS, as
 * `@evolu/sqlite-wasm` 2.2.4 ships them (SQLite 3.50.4, SQLite3 Multiple
 * Ciphers 2.2.4), which `@evolu/web` shipped until 3.4.1, for the
 * interoperability tests of `SahPool` and of encrypted databases.
 *
 * It runs the steps `setupSqliteJsWorker` in `_harness.ts` sends, through
 * `serveSteps`, with one pool, opened as `@evolu/web` 3.4.1 opens it, and its
 * databases by file name, which stay open until closed.
 *
 * Never open a pool another context holds: 2.2.4 then removes the pool
 * directory, databases included.
 *
 * @module
 */

import { assert, bytesToHex } from "@evolu/common";
import sqlite3InitModule from "@evolu/sqlite-wasm-2.2.4";
import { serveSteps } from "./_serve.ts";

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;
type SahPoolUtil = Awaited<ReturnType<Sqlite3["installOpfsSAHPoolVfs"]>>;
type Database = InstanceType<SahPoolUtil["OpfsSAHPoolDb"]>;

let sqlite3: Sqlite3 | null = null;
let pool: SahPoolUtil | null = null;
const databasesByFileName = new Map<string, Database>();

const getPool = (): SahPoolUtil => {
  assert(pool != null, "The worker has no pool.");
  return pool;
};

/** Returns the open database of the file name, opening it first. */
const getDatabase = (fileName: string): Database => {
  let database = databasesByFileName.get(fileName);
  if (database == null) {
    database = new (getPool().OpfsSAHPoolDb)(fileName);
    databasesByFileName.set(fileName, database);
  }
  return database;
};

/**
 * Opens a database of the pool in the directory through the `multipleciphers-`
 * wrapper of its VFS, as `@evolu/web` 3.4.1 opens an encrypted database, keyed
 * with the SQL. The pool and the wrapper are installed once.
 */
const openKeyedDatabase = async (
  directory: string,
  fileName: string,
  keySql: string,
): Promise<void> => {
  assert(sqlite3 != null, "The worker has not loaded SQLite.");
  if (pool == null) {
    // The types of 2.2.4 lack the functions of SQLite3 Multiple Ciphers.
    const { sqlite3mc_vfs_create } = sqlite3.capi as unknown as {
      readonly sqlite3mc_vfs_create: (
        vfs: string,
        makeDefault: number,
      ) => number;
    };
    sqlite3mc_vfs_create("opfs", 1);
    pool = await sqlite3.installOpfsSAHPoolVfs({ directory });
  }
  if (pool.isPaused()) await pool.unpauseVfs();
  const database = new pool.OpfsSAHPoolDb(
    `file:${fileName}?vfs=multipleciphers-opfs-sahpool`,
  );
  database.exec(keySql);
  databasesByFileName.set(fileName, database);
};

const steps = {
  load: async (): Promise<void> => {
    sqlite3 = await sqlite3InitModule({
      // It reports that it cannot install the "opfs" VFS, which needs
      // cross-origin isolation.
      print: () => undefined,
      printErr: () => undefined,
    });
  },

  libversion: (): string => {
    assert(sqlite3 != null, "The worker has not loaded SQLite.");
    return sqlite3.version.libVersion;
  },

  /**
   * Installs the pool in the directory, or unpauses it, and returns its file
   * names. The VFS name is the directory's, which no other worker uses.
   */
  openPool: async (directory: string): Promise<ReadonlyArray<string>> => {
    assert(sqlite3 != null, "The worker has not loaded SQLite.");
    if (pool == null)
      pool = await sqlite3.installOpfsSAHPoolVfs({
        name: `sqlite-js-${directory}`,
        directory,
      });
    else await pool.unpauseVfs();
    return pool.getFileNames();
  },

  /**
   * Opens `evolu1.db` in the directory encrypted with the key, as `@evolu/web`
   * opens an encrypted database with 2.2.4 in `packages/web/src/Sqlite.ts`:
   * `sqlite3mc_vfs_create("opfs", 1)`, the pool in the directory under the
   * default VFS name, the database by a URI that names the `multipleciphers-`
   * wrapper of the pool's VFS, and the `sqlcipher` scheme keyed with the SQL
   * text `x'<hex>'`, which SQLite3 Multiple Ciphers 2.2.4 takes as a
   * passphrase. Later steps reach the database by the file name `evolu1.db`.
   */
  openEvoluWebDatabase: (directory: string, key: Uint8Array): Promise<void> =>
    openKeyedDatabase(
      directory,
      "evolu1.db",
      `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "x'${bytesToHex(key)}'";`,
    ),

  /**
   * Opens a database of the directory as `openEvoluWebDatabase` opens
   * `evolu1.db`, keyed with other SQL, such as `PRAGMA key = "raw:<hex>"`,
   * which 2.2.4 takes as the raw key.
   */
  openKeyedDatabase: (
    directory: string,
    fileName: string,
    keySql: string,
  ): Promise<void> => openKeyedDatabase(directory, fileName, keySql),

  getFileNames: (): ReadonlyArray<string> => getPool().getFileNames(),

  /** Pauses the pool, closing its handles; its databases must be closed. */
  pausePool: (): void => {
    getPool().pauseVfs();
  },

  /** Runs SQL on the database of the file name. */
  exec: (fileName: string, sql: string): void => {
    getDatabase(fileName).exec(sql);
  },

  /** Returns the rows of a query on the database of the file name. */
  selectObjects: (
    fileName: string,
    sql: string,
  ): ReadonlyArray<Record<string, unknown>> =>
    getDatabase(fileName).selectObjects(sql),

  /** Returns the first column of a query's first row. */
  selectValue: (fileName: string, sql: string): unknown =>
    getDatabase(fileName).selectValue(sql),

  close: (fileName: string): void => {
    databasesByFileName.get(fileName)?.close();
    databasesByFileName.delete(fileName);
  },
};

/** The steps the worker runs, by name. */
export type SqliteJsSteps = typeof steps;

serveSteps(steps);
