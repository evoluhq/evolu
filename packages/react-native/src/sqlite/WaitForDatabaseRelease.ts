/**
 * The {@link WaitForDatabaseRelease} of Evolu for React Native.
 *
 * @module
 */
import { err, ok } from "@evolu/common";
import type {
  DatabaseHeldError,
  WaitForDatabaseRelease,
} from "@evolu/common/local-first";
import type { NativeSqliteDep } from "./Binding.ts";
import {
  databasePath,
  retryWhileHeld,
  type DatabaseDirectoryDep,
} from "./Driver.ts";

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
