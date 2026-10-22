/**
 * The SQLite driver of Evolu for React Native, on Evolu's native SQLite
 * binding, which `Binding.ts` describes.
 *
 * A database is the file `evolu1-<name>.db` in the directory the driver gets,
 * expo-sqlite's, so the databases Evolu's expo-sqlite driver created open in
 * place. The `encrypted` mode opens it with the encryption key, the mode
 * without options opens it in plaintext, and the `memory` mode opens a database
 * of its own in memory. Every open of a file goes through Evolu's codec, which
 * also opens the files expo-sqlite's SQLCipher wrote and rolls back their hot
 * journals.
 *
 * One connection of the process holds a file at a time. The DbWorker waits for
 * another runtime's connection to close the file with
 * {@link createWaitForDatabaseRelease} first, but a runtime still starting, as
 * during an early reload, can open it between that wait and the open, so an
 * open of a held file tries again, as the wait does, and throws once it's still
 * held 10 seconds after the first attempt.
 *
 * The {@link SqliteDriver} contract has no error channel, so the driver throws
 * what the binding throws, such as an `Error` whose cause is a
 * {@link NativeSqliteError} for a wrong key.
 *
 * @module
 */
import {
  createPreparedStatementsCache,
  err,
  ok,
  performanceDurationBetween,
  sleep,
  trySync,
  typed,
  type CreateSqliteDriver,
  type InferType,
  type Name,
  type PositiveMillis,
  type Result,
  type SqliteDriver,
  type Task,
} from "@evolu/common";
import type {
  NativeSqliteDep,
  NativeSqliteError,
  NativeSqliteStatement,
} from "./Binding.ts";
import type { createWaitForDatabaseRelease } from "./WaitForDatabaseRelease.ts";

/** Dependency wrapper for the directory of the database files. */
export interface DatabaseDirectoryDep {
  /**
   * The absolute path of the directory, without a trailing slash, which an open
   * creates when it's missing.
   */
  readonly databaseDirectory: string;
}

/**
 * Another connection of the process has the database file open, so an open or a
 * delete of it fails before it touches the file. The binding throws an `Error`
 * with it as its cause.
 */
export const DatabaseFileHeldError = /*#__PURE__*/ typed(
  "DatabaseFileHeldError",
);
export interface DatabaseFileHeldError extends InferType<
  typeof DatabaseFileHeldError
> {}

/** Creates the {@link CreateSqliteDriver} of Evolu for React Native. */
export const createNativeSqliteDriver =
  (deps: DatabaseDirectoryDep & NativeSqliteDep): CreateSqliteDriver =>
  (name, options) =>
  async (run) => {
    const { nativeSqlite } = deps;
    const path = databasePath(deps, name);
    using disposer = new DisposableStack();

    // A memory database has no file another connection could hold, so its
    // open never tries again.
    const opened = await run(
      retryWhileHeld(() => {
        try {
          switch (options?.mode) {
            case "memory":
              return ok(nativeSqlite.openMemory());
            case "encrypted":
              return ok(
                nativeSqlite.openEncryptedFile(path, options.encryptionKey),
              );
            case undefined:
              return ok(nativeSqlite.openFile(path));
          }
        } catch (error) {
          if (error instanceof Error && DatabaseFileHeldError.is(error.cause))
            return err(error);
          throw error;
        }
      }),
    );
    if (!opened.ok) throw opened.error;
    const database = opened.value;
    disposer.defer(() => {
      database.close();
    });

    const cache = disposer.use(
      createPreparedStatementsCache<NativeSqliteStatement>(
        (sql) => database.prepare(sql),
        (statement) => {
          statement.finalize();
        },
      ),
    );

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        const cached = cache.get(query);
        if (cached) return cached.run(query.parameters);
        const statement = database.prepare(query.sql);
        try {
          return statement.run(query.parameters);
        } finally {
          statement.finalize();
        }
      },

      iterate: (query, onRow) => {
        // A statement of its own, because onRow can run queries, which could
        // otherwise run the cached one while it is stepped.
        const statement = database.prepare(query.sql);
        try {
          statement.bind(query.parameters);
          for (;;) {
            const row = statement.step();
            if (row === null || !onRow(row)) break;
          }
        } catch (error) {
          // What onRow or a step threw wins over completing the statement,
          // whose commit can fail after a row of a write with RETURNING, as
          // in @evolu/sqlite-wasm.
          trySync(() => {
            statement.finalize();
          });
          throw error;
        }
        // After an early stop, completing the statement can fail too.
        statement.finalize();
      },

      export: () => new Uint8Array(database.export()),

      deleteDatabase: () => {
        disposables.dispose();
        if (options?.mode !== "memory") nativeSqlite.deleteFile(path);
      },

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };

/**
 * The file of the database `name`, `evolu1-<name>.db`, as expo-sqlite's driver
 * named it. A {@link Name} is URL-safe, so it never leaves the directory.
 */
export const databasePath = (
  { databaseDirectory }: DatabaseDirectoryDep,
  name: Name,
): string => `${databaseDirectory}/evolu1-${name}.db`;

/**
 * Runs `attempt` at once and, until one returns ok, again 50 ms after an
 * attempt that returned an error, then after twice the previous delay, up to a
 * second. It returns the error of an attempt that ends 10 seconds or more after
 * the first started, as the web waits for a database another context holds.
 */
export const retryWhileHeld =
  <T, E>(attempt: () => Result<T, E>): Task<T, E> =>
  async (run) => {
    const { time } = run.deps;
    const start = time.performance.now();
    let result = attempt();
    for (
      let delay = 50;
      !result.ok &&
      performanceDurationBetween(start, time.performance.now()) < 10_000;
      delay = Math.min(delay * 2, 1000)
    ) {
      await run.ok(sleep(delay as PositiveMillis));
      result = attempt();
    }
    return result;
  };
