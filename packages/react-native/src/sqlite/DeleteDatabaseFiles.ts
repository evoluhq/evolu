/**
 * The {@link DeleteDatabaseFiles} of Evolu for React Native.
 *
 * @module
 */
import {
  createUnknownError,
  DatabaseFileHeldError,
  err,
  ok,
  retryWhileHeld,
  type NativeSqliteDep,
  type Result,
  type UnknownError,
} from "@evolu/common";
import type {
  DatabaseHeldError,
  DeleteDatabaseFiles,
} from "@evolu/common/local-first";
import { databasePath, type DatabaseDirectoryDep } from "./Driver.ts";

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
