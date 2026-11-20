/**
 * The SQLite of Evolu for React Native: its driver, `@evolu/common`'s
 * {@link createNativeSqliteDriver} over the database files in expo-sqlite's
 * directory, and what the DbWorker does with those files.
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
 * On iOS, where `fsync()` may persist writes late and out of order, a file
 * connection syncs with `F_BARRIERFSYNC`, so with SQLite's default `synchronous
 * = FULL`, a crash leaves each transaction whole, though the last ones before
 * it may be lost.
 *
 * @module
 */
import {
  createNativeSqliteDriver,
  createUnknownError,
  DatabaseFileHeldError,
  err,
  isPlainObject,
  ok,
  retryWhileHeld,
  sql,
  type CreateSqliteDriver,
  type Name,
  type NativeSqliteDep,
  type Result,
  type UnknownError,
} from "@evolu/common";
import type {
  DatabaseHeldError,
  DeleteDatabaseFiles,
  Evolu7DatabaseExists,
  WaitForDatabaseRelease,
} from "@evolu/common/local-first";

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
    // The binding allows one connection per file in the process, so the lock
    // costs no concurrency.
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
 * Creates the {@link WaitForDatabaseRelease} of Evolu for React Native, which
 * waits until no connection of the process holds the database file the driver
 * opens, such as one a runtime that a reload replaced still has.
 *
 * It asks the binding whether the file is open, again 50 ms after it was, then
 * after twice the previous delay, up to a second, and fails with
 * {@link DatabaseHeldError} when the file is still open 10 seconds after the
 * first attempt, as on the web. A file whose directory doesn't exist yet, as on
 * a fresh install, isn't open. Every other error is thrown, as the driver
 * throws it.
 */
export const createWaitForDatabaseRelease =
  (deps: DatabaseDirectoryDep & NativeSqliteDep): WaitForDatabaseRelease =>
  (name) => {
    const path = databasePath(deps, name);
    return retryWhileHeld(() =>
      deps.nativeSqlite.isFileOpen(path)
        ? err({ type: "DatabaseHeldError", name })
        : ok(),
    );
  };

/**
 * Creates the {@link DeleteDatabaseFiles} of Evolu for React Native, which
 * deletes the database file the driver opens, then its `-journal`, `-wal` and
 * `-shm`, without opening it. Missing files, also in a directory that doesn't
 * exist yet, count as deleted.
 *
 * The binding refuses to delete a file a connection of the process holds, such
 * as one a runtime that a reload replaced still has, so a held file is tried
 * again as {@link retryWhileHeld} does, and the deletion fails with
 * {@link DatabaseHeldError} when the file is still held 10 seconds after the
 * first attempt. Anything else the binding throws, such as for a file it can't
 * remove, fails it at once with an {@link UnknownError}. The binding stops at
 * the first file it can't remove, so the files after it stay.
 */
export const createDeleteDatabaseFiles =
  (deps: DatabaseDirectoryDep & NativeSqliteDep): DeleteDatabaseFiles =>
  (name) =>
  async (run) => {
    const path = databasePath(deps, name);
    // Only a held file is tried again, so an attempt returns any other failure
    // as its value.
    const deleted = await run(
      retryWhileHeld<Result<void, UnknownError>, DatabaseHeldError>(() => {
        try {
          deps.nativeSqlite.deleteFile(path);
          return ok(ok());
        } catch (error) {
          if (error instanceof Error && DatabaseFileHeldError.is(error.cause))
            return err({ type: "DatabaseHeldError", name });
          return ok(err(createUnknownError(error)));
        }
      }),
    );
    return deleted.ok ? deleted.value : deleted;
  };

/**
 * Creates the {@link Evolu7DatabaseExists} of Evolu for React Native, which
 * tells whether the database file the driver opens exists, without creating
 * it.
 *
 * Opening a missing file creates it, but the binding opens an attached database
 * read-only, which creates nothing, so this attaches the file to a database in
 * memory. SQLite fails that with SQLITE_CANTOPEN for a missing file, also in a
 * directory that doesn't exist yet. Any other failure SQLite reports is of a
 * file that exists, such as one that isn't a database or that another
 * connection is writing to. Anything else the binding throws fails with an
 * {@link UnknownError}.
 *
 * SQLite fails with SQLITE_CANTOPEN also for a file the attach can't open, such
 * as a database in WAL mode, which the memory database's codec refuses, or a
 * file the system denies. Such a file reads as missing. Evolu 7, whose
 * databases the lookup is for, never used WAL.
 *
 * It finds the databases of Evolu 7's expo-sqlite driver, which kept them where
 * this driver does. Evolu 7's op-sqlite driver kept them elsewhere, and no app
 * is known to have used it, so those stay as they are.
 */
export const createEvolu7DatabaseExists =
  (deps: DatabaseDirectoryDep & NativeSqliteDep): Evolu7DatabaseExists =>
  (name) =>
  () => {
    try {
      using disposer = new DisposableStack();
      const database = deps.nativeSqlite.openMemory();
      disposer.defer(() => {
        database.close();
      });
      database.run(`attach database ? as "attached";`, [
        databasePath(deps, name),
      ]);
      return ok(true);
    } catch (error) {
      if (
        error instanceof Error &&
        isPlainObject(error.cause) &&
        error.cause.type === "SqliteError"
      )
        return ok(error.cause.extendedCode !== sqliteCantOpen);
      return err(createUnknownError(error));
    }
  };

/**
 * The file of the database `name`, `evolu1-<name>.db`, as expo-sqlite's driver
 * named it. A {@link Name} is URL-safe, so it never leaves the directory.
 */
export const databasePath = (
  { databaseDirectory }: DatabaseDirectoryDep,
  name: Name,
): string => `${databaseDirectory}/evolu1-${name}.db`;

/** SQLITE_CANTOPEN. */
const sqliteCantOpen = 14;
