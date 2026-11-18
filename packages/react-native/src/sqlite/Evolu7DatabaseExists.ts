/**
 * The {@link Evolu7DatabaseExists} of Evolu for React Native.
 *
 * @module
 */
import {
  createUnknownError,
  err,
  isPlainObject,
  ok,
  type NativeSqliteDep,
  type UnknownError,
} from "@evolu/common";
import type { Evolu7DatabaseExists } from "@evolu/common/local-first";
import { databasePath, type DatabaseDirectoryDep } from "./Driver.ts";

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

/** SQLITE_CANTOPEN. */
const sqliteCantOpen = 14;
