/**
 * The SQLite driver of Evolu for React Native, `@evolu/common`'s
 * {@link createNativeSqliteDriver} over the database files in expo-sqlite's
 * directory.
 *
 * A database is the file `evolu1-<name>.db` in the directory the driver gets,
 * so the databases Evolu's expo-sqlite driver created open in place. Evolu
 * opens them with their key, through Evolu's codec, which also opens the files
 * expo-sqlite's SQLCipher wrote and rolls back their hot journals. The DbWorker
 * waits for another runtime's connection to close the file with
 * {@link createWaitForDatabaseRelease} first.
 *
 * An encrypted database is opened in exclusive locking mode: its connection
 * takes the file's lock at the open and holds it until it closes, so SQLite
 * keeps its page cache between transactions without rereading page 1. Its
 * rollback journal stays between transactions, truncated to 0 bytes after each
 * commit, until a connection that wrote closes.
 *
 * @module
 */
import {
  createNativeSqliteDriver,
  sql,
  type CreateSqliteDriver,
  type Name,
  type NativeSqliteDep,
} from "@evolu/common";
import type { createWaitForDatabaseRelease } from "./WaitForDatabaseRelease.ts";

/** Dependency wrapper for the directory of the database files. */
export interface DatabaseDirectoryDep {
  /**
   * The absolute path of the directory, without a trailing slash, which an open
   * creates when it's missing.
   */
  readonly databaseDirectory: string;
}

/** Creates the {@link CreateSqliteDriver} of Evolu for React Native. */
export const createReactNativeSqliteDriver = (
  deps: DatabaseDirectoryDep & NativeSqliteDep,
): CreateSqliteDriver => {
  const createSqliteDriver = createNativeSqliteDriver({
    nativeSqlite: deps.nativeSqlite,
    databasePath: (name) => databasePath(deps, name),
  });

  return (name, options) => async (run) => {
    const opened = await run(createSqliteDriver(name, options));
    if (!opened.ok || options?.mode !== "encrypted") return opened;
    using disposer = new DisposableStack();
    const driver = disposer.use(opened.value);
    // In normal locking mode, every transaction locks the file, checks for a
    // hot journal and rereads page 1's change counter, which the codec
    // authenticates and decrypts whole: 7 µs on the binding's N-API mirror
    // (M-series Mac, November 2026). Queries share a transaction per batch,
    // but sync reconciliation runs most of its storage reads on their own,
    // about 12,000 in the protocol benchmark's random-halves-20k scenario.
    // Exclusive mode also cuts a small write transaction's commit from 0.2 to
    // 0.08 ms. The binding allows one connection per file in the process, so
    // the lock costs no concurrency.
    // The directory is in the app's own container, not an app group's, so iOS
    // doesn't terminate a suspended app for holding the lock (0xdead10cc). A
    // journal size limit of 0 truncates the journal the mode keeps after each
    // commit, so it takes no space between transactions. An app killed during
    // a write leaves a hot journal, as in normal mode, which the next open
    // rolls back.
    for (const query of [
      sql`pragma journal_size_limit = 0;`,
      sql`pragma locking_mode = exclusive;`,
      sql`begin exclusive;`,
      sql`commit;`,
    ])
      driver.exec(query);
    disposer.move();
    return opened;
  };
};

/**
 * The file of the database `name`, `evolu1-<name>.db`, as expo-sqlite's driver
 * named it. A {@link Name} is URL-safe, so it never leaves the directory.
 */
export const databasePath = (
  { databaseDirectory }: DatabaseDirectoryDep,
  name: Name,
): string => `${databaseDirectory}/evolu1-${name}.db`;
