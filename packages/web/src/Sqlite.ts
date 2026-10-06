/**
 * The SQLite driver of Evolu for the web, on `@evolu/sqlite-wasm`.
 *
 * @module
 */

import {
  createPreparedStatementsCache,
  err,
  exhaustiveCheck,
  ok,
  type CreateSqliteDriver,
  type DatabaseHeldError,
  type Name,
  type Result,
  type SqliteDriver,
  type Task,
  type Typed,
  type TypeName,
} from "@evolu/common";
import type { WaitForDatabaseRelease } from "@evolu/common/local-first";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  createSqliteWasm,
  OpfsName,
  openSahPool,
  sqliteWasmUrl,
  SqliteVfsPath,
  type deriveLegacySqliteKey,
  type OpfsRootDep,
  type SahPool,
  type SahPoolError,
  type SahPoolOptions,
  type SqliteDatabase,
  type SqliteError,
  type SqliteStatement,
  type SqliteWasm,
  type SqliteWasmDep,
  type SqliteWasmError,
  type SubtleCryptoDep,
} from "@evolu/sqlite-wasm";

/**
 * Loads SQLite from the {@link sqliteWasmUrl} of `@evolu/sqlite-wasm` for
 * {@link createWasmSqliteDriver}. It passes the fetch to
 * {@link createSqliteWasm}, which compiles the binary while it downloads when
 * the server sends it as `application/wasm`, and from its bytes otherwise.
 *
 * Start it in the worker's composition root, so SQLite loads while the worker
 * waits for its database.
 */
export const loadSqliteWasm: Task<SqliteWasm, SqliteWasmError> = (run) =>
  run(createSqliteWasm(run.deps.nativeFetch(sqliteWasmUrl)), run.deps);

/**
 * Creates the {@link CreateSqliteDriver} of Evolu for the web.
 *
 * A database is the file `/evolu1.db` in a pool of OPFS sync access handles in
 * the directory `.<name>`, in the format of SQLite's opfs-sahpool, and the pool
 * encrypts it in the `encrypted` mode. So the databases `@evolu/web` 3 created
 * with `@evolu/sqlite-wasm` 2.2.4 open unchanged, an encrypted one with the key
 * 2.2.4 derived from the encryption key, which is never rekeyed. 2.2.4 derived
 * it because of a bug in SQLite3 Multiple Ciphers: it took the encryption key,
 * passed in SQLCipher's notation for a raw key, as a passphrase
 * (https://github.com/utelle/SQLite3MultipleCiphers/issues/218), as
 * {@link deriveLegacySqliteKey} of `@evolu/sqlite-wasm` describes. A new
 * encrypted database is encrypted with the encryption key itself, so
 * `@evolu/web` 3.4.1 and earlier cannot open it. A database in the `memory`
 * mode uses no OPFS.
 *
 * In WebKit on macOS, such as Safari, whose file system ignores case by
 * default, names that differ only in case share the directory, and both can
 * hold it at once, so make database names differ in more than case.
 *
 * The pool is opened once, so the driver throws while another context holds a
 * file of it. A DbWorker waits for the files with
 * {@link createWaitForDatabaseRelease} first.
 *
 * The {@link SqliteDriver} contract has no error channel, so every error, such
 * as a query's {@link SqliteError}, is thrown as the cause of an `Error` whose
 * message is SQLite's message, or the error's type for an error without one.
 */
export const createWasmSqliteDriver =
  (deps: WasmSqliteDriverDeps): CreateSqliteDriver =>
  (name, options) =>
  async (run) => {
    const sqliteWasm = getOrThrowWithMessage(await deps.sqliteWasmLoad);
    const databaseDeps = { ...deps, sqliteWasm };

    let deleteDatabaseFile = false;
    using disposer = new DisposableStack();

    const openPool = async (): Promise<SahPool> => {
      const pool = disposer.use(
        getOrThrowWithMessage(await run(openDatabasePool(name), databaseDeps)),
      );
      disposer.defer(() => {
        if (deleteDatabaseFile)
          getOrThrowWithMessage(pool.unlink(databasePath));
      });
      return pool;
    };

    let database: SqliteDatabase;

    switch (options?.mode) {
      case "memory":
        database = disposer.use(
          getOrThrowWithMessage(
            createSqliteDatabase(databaseDeps)({ type: "Memory" }),
          ),
        );
        break;

      case "encrypted": {
        const encrypted = getOrThrowWithMessage(
          await run(
            createEncryptedSqliteDatabase({
              type: "EncryptedFile",
              vfs: await openPool(),
              path: databasePath,
              key: options.encryptionKey,
            }),
            databaseDeps,
          ),
        );
        database = disposer.use(encrypted.database);
        break;
      }

      case undefined:
        database = disposer.use(
          getOrThrowWithMessage(
            createSqliteDatabase(databaseDeps)({
              type: "File",
              vfs: await openPool(),
              path: databasePath,
            }),
          ),
        );
        break;

      default:
        exhaustiveCheck(options);
    }

    const cache = disposer.use(
      createPreparedStatementsCache<SqliteStatement>(
        (sql) => getOrThrowWithMessage(database.prepare(sql)),
        (statement) => {
          statement[Symbol.dispose]();
        },
      ),
    );

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        const statement = cache.get(query);
        return getOrThrowWithMessage(
          statement
            ? statement.run(query.parameters)
            : database.run(query.sql, query.parameters),
        );
      },

      export: () => getOrThrowWithMessage(database.export()),

      deleteDatabase: () => {
        deleteDatabaseFile = true;
        disposables.dispose();
      },

      [Symbol.dispose]: () => {
        disposables.dispose();
      },
    });
  };

/** Dependencies of {@link createWasmSqliteDriver}. */
export type WasmSqliteDriverDeps = OpfsRootDep &
  SqliteWasmLoadDep &
  SubtleCryptoDep;

/** Dependency wrapper for SQLite as {@link loadSqliteWasm} loads it. */
export interface SqliteWasmLoadDep {
  /**
   * SQLite, as {@link loadSqliteWasm} loads it, still loading or loaded. A
   * failed load throws when a database is opened.
   */
  readonly sqliteWasmLoad: PromiseLike<Result<SqliteWasm, SqliteWasmError>>;
}

/**
 * Creates the {@link WaitForDatabaseRelease} of Evolu for the web. It opens the
 * pool {@link createWasmSqliteDriver} opens for the database, and disposes it
 * once it opens.
 *
 * When another context holds a file of the pool, the pool is opened again after
 * 50 ms, then after twice the previous delay, up to a second, with the
 * `heldTimeout` option of {@link openSahPool}, and the wait fails with
 * {@link DatabaseHeldError} when it is still held 10 seconds after the first
 * attempt started. Evolu then refuses to start the database, and the app
 * receives the error as its `evoluError`. Every other error is thrown, as the
 * driver throws it.
 */
export const createWaitForDatabaseRelease =
  (deps: OpfsRootDep & SqliteWasmLoadDep): WaitForDatabaseRelease =>
  (name) =>
  async (run) => {
    const sqliteWasm = getOrThrowWithMessage(await deps.sqliteWasmLoad);
    const opened = await run(
      // Longer than the two seconds Chromium gives a terminated worker.
      openDatabasePool(name, { heldTimeout: "10s" }),
      { ...deps, sqliteWasm },
    );
    if (!opened.ok && opened.error.type === "SahPoolHeldError")
      return err({ type: "DatabaseHeldError", name });
    using _pool = getOrThrowWithMessage(opened);
    return ok();
  };

// The pool of a database's file is in the directory `.<name>`, as in
// @evolu/web 3.
const openDatabasePool = (
  name: Name,
  options?: Pick<SahPoolOptions, "heldTimeout">,
): Task<SahPool, SahPoolError, OpfsRootDep & SqliteWasmDep> =>
  // A Name is non-empty and URL-safe, so `.<name>` always passes.
  openSahPool({ ...options, directory: [OpfsName.orThrow(`.${name}`)] });

// The path SQLite's opfs-sahpool gave `file:evolu1.db`, which @evolu/web 3
// opened.
const databasePath = /*#__PURE__*/ SqliteVfsPath.orThrow("/evolu1.db");

// The SqliteDriver contract has no error channel, and the WaitForDatabaseRelease
// contract only DatabaseHeldError, so any other error is thrown as the cause of
// an Error, with SQLite's message when it has one.
const getOrThrowWithMessage = <T>(result: Result<T, Typed<TypeName>>): T => {
  if (result.ok) return result.value;
  const { error } = result;
  throw new Error(
    "message" in error && typeof error.message === "string"
      ? error.message
      : error.type,
    { cause: error },
  );
};
