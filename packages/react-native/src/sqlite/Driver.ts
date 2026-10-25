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
 * @module
 */
import {
  createNativeSqliteDriver,
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
): CreateSqliteDriver =>
  createNativeSqliteDriver({
    nativeSqlite: deps.nativeSqlite,
    databasePath: (name) => databasePath(deps, name),
  });

/**
 * The file of the database `name`, `evolu1-<name>.db`, as expo-sqlite's driver
 * named it. A {@link Name} is URL-safe, so it never leaves the directory.
 */
export const databasePath = (
  { databaseDirectory }: DatabaseDirectoryDep,
  name: Name,
): string => `${databaseDirectory}/evolu1-${name}.db`;
