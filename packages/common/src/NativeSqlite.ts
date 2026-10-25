/**
 * Evolu's native SQLite binding and the {@link SqliteDriver} over it, which
 * `@evolu/react-native` and `@evolu/nodejs` share.
 *
 * The binding is the JavaScript interface that `@evolu/react-native`'s JSI
 * adapter implements on React Native and `@evolu/nodejs`'s Node-API addon in
 * Node.js, both over the binding layer of Evolu's SQLite core,
 * `binding/evolu_database.h`. `@evolu/react-native`'s
 * `test/bindingConformance.ts` pins that both behave alike.
 *
 * ## Values
 *
 * - `null` binds NULL, a safe integer binds as INTEGER, any other finite number
 *   as REAL, a string as text with its exact UTF-8 length, its lone surrogates
 *   as U+FFFD, and a `Uint8Array` as a blob, an empty one too. Any other value,
 *   and a number of parameters other than the SQL's, throws a TypeError.
 * - INTEGER and REAL read as numbers, so an integer beyond 2^53 rounds, as in
 *   `@evolu/sqlite-wasm`. TEXT reads with its exact length, so NUL characters
 *   survive, and TEXT that isn't UTF-8 with U+FFFD in place of each ill-formed
 *   sequence, as the WHATWG decoder reads it, and so do column names and error
 *   messages. A blob is a copy with a buffer of its own.
 * - Rows are null-prototype objects, and of columns with the same name, the last
 *   wins. A statement reads its column names again after a schema change
 *   prepared it again.
 *
 * ## Statements
 *
 * - {@link NativeSqliteDatabase.prepare} takes exactly one statement, as
 *   `@evolu/sqlite-wasm` does: SQL with a NUL character or a lone surrogate,
 *   which SQLite would read as other SQL, fails before SQLite sees it, SQL
 *   without a statement fails, and only semicolons, whitespace, UTF-8 byte
 *   order marks and comments may follow the statement. The rest is scanned, not
 *   prepared, since SQLite applies some pragmas when it prepares them.
 * - {@link NativeSqliteStatement.run} binds, steps to the end and resets, also
 *   when it fails. Its `changes` is 0 when the run changed no rows or the
 *   statement is read-only, and otherwise `sqlite3_changes64`. SQLite keeps a
 *   copy of each bound value until its parameter is bound again, so a run that
 *   bound a text or blob over 64 KiB, as UTF-8 for text, clears its bindings
 *   after it resets, also when it fails, as `@evolu/sqlite-wasm` does, and a
 *   kept statement holds no large value between runs.
 * - {@link NativeSqliteStatement.step} returns a row or null and never resets.
 *   {@link NativeSqliteStatement.reset} and
 *   {@link NativeSqliteStatement.finalize} throw SQLite's error only when the
 *   last step returned a row, which is when completing the statement can fail,
 *   as the commit of a write with RETURNING that an iteration stopped early.
 *   `reset` keeps the bindings.
 * - {@link NativeSqliteDatabase.close} finalizes every statement, closes the
 *   connection and releases its file, never throws for an error SQLite reports,
 *   and does nothing the second time. When SQLite can't close it, as with a
 *   backup unfinished, the connection stays open, holding its file, and a later
 *   close tries again, but the statements stay finalized. A handle used after
 *   its database closed, or a statement after its finalize or its database's
 *   close, throws, and so does a method called on another kind of object.
 *
 * ## Files
 *
 * - One connection per database file in the process: an open of a file another
 *   connection holds, through any spelling of its path, fails with
 *   {@link DatabaseFileHeldError} before it touches the file, and so does
 *   {@link NativeSqlite.deleteFile}.
 * - A path that contains a NUL character, isn't absolute, or whose last component
 *   is empty, `.` or `..` throws a TypeError, and so does a key that isn't a
 *   `Uint8Array` of 32 bytes.
 * - An encrypted file opens through Evolu's codec, also the databases
 *   expo-sqlite's SQLCipher wrote, and a plain file with plain SQLite;
 *   `binding/evolu_database.h` describes what an open, a delete and an export
 *   do. A pragma that keys a database, such as `pragma key`, fails on every
 *   file rather than leave it in plaintext, and an attached database is
 *   read-only, because SQLite ignores the `KEY` clause of `ATTACH`.
 *
 * ## Errors
 *
 * An error SQLite reports is thrown as an `Error` with SQLite's message and a
 * {@link NativeSqliteError} as its cause. A SQL text that prepare refuses has a
 * {@link NativeSqliteSqlTextError} as its cause, and a held file a
 * {@link DatabaseFileHeldError}.
 *
 * @module
 */
import type { encryptWithXChaCha20Poly1305 } from "./Crypto.ts";
import { disposable } from "./Function.ts";
import { err, ok, trySync, type Result } from "./Result.ts";
import type {
  CreateSqliteDriver,
  SqliteDriver,
  SqliteDriverStatement,
  SqliteExecResult,
  SqliteRow,
  SqliteValue,
} from "./Sqlite.ts";
import { sleep, type Task } from "./Task.ts";
import { performanceDurationBetween, type PositiveMillis } from "./Time.ts";
import { typed, type InferType, type Name, type Typed } from "./Type.ts";

/** The binding the native code creates for a JavaScript runtime. */
export interface NativeSqlite {
  /**
   * The version of this interface the native code implements, which the loader
   * checks, so JavaScript never runs on native code built for another version.
   */
  readonly abiVersion: number;
  readonly openMemory: () => NativeSqliteDatabase;
  readonly openFile: (path: string) => NativeSqliteDatabase;
  readonly openEncryptedFile: (
    path: string,
    key: Uint8Array,
  ) => NativeSqliteDatabase;
  /** Whether a connection of the process holds the database file. */
  readonly isFileOpen: (path: string) => boolean;
  /**
   * Deletes the database file, then its `-journal`, `-wal` and `-shm`, and
   * stops at the first it can't remove. Missing files are fine.
   */
  readonly deleteFile: (path: string) => void;
  /** Fills the bytes with the platform's CSPRNG. */
  readonly fillRandom: (bytes: Uint8Array) => void;
  /**
   * Encrypts the plaintext into the ciphertext followed by its 16-byte tag, as
   * {@link encryptWithXChaCha20Poly1305} does with the nonce.
   */
  readonly encryptXChaCha20Poly1305: (
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
  ) => Uint8Array;
  /**
   * Decrypts a ciphertext followed by its tag, and throws when the tag doesn't
   * authenticate it, an input shorter than a tag included.
   */
  readonly decryptXChaCha20Poly1305: (
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
  ) => Uint8Array;
}

export interface NativeSqliteDatabase {
  readonly prepare: (sql: string) => NativeSqliteStatement;
  /**
   * Returns the database as the plaintext file of its pages. It fails inside a
   * write transaction.
   */
  readonly export: () => ArrayBuffer;
  readonly close: () => void;
}

export interface NativeSqliteStatement {
  readonly run: (parameters: ReadonlyArray<SqliteValue>) => SqliteExecResult;
  readonly bind: (parameters: ReadonlyArray<SqliteValue>) => void;
  readonly step: () => SqliteRow | null;
  readonly reset: () => void;
  readonly finalize: () => void;
}

/** Dependency wrapper for {@link NativeSqlite}. */
export interface NativeSqliteDep {
  readonly nativeSqlite: NativeSqlite;
}

/**
 * The cause of an error SQLite reported, as `@evolu/sqlite-wasm`'s
 * `SqliteError`.
 */
export interface NativeSqliteError extends Typed<"SqliteError"> {
  readonly operation: NativeSqliteOperation;
  readonly extendedCode: number;
  /** `sqlite3_errmsg`, or `sqlite3_errstr` when SQLite reported nothing. */
  readonly message: string;
  /** Where in the UTF-8 SQL a parser error was found, or null. */
  readonly sqlOffset: number | null;
  /**
   * The errno of a SQLITE_CANTOPEN or SQLITE_IOERR without a codec failure, or
   * null. It's diagnostic only.
   */
  readonly systemErrno: number | null;
  readonly cause: NativeSqliteCodecFailure | null;
}

/**
 * The binding function an error comes from; the completion of a statement that
 * `reset` or `finalize` reports is its `step`.
 */
export type NativeSqliteOperation =
  "open" | "prepare" | "bind" | "step" | "export" | "isFileOpen" | "deleteFile";

/** The failure Evolu's codec recorded for the call. */
export interface NativeSqliteCodecFailure extends Typed<"SqliteCodecFailure"> {
  readonly error:
    | NativeSqlitePageAuthenticationError
    | NativeSqliteEncryptionUnsupportedError
    | NativeSqliteRandomSourceError;
}

/** A page failed to authenticate, as with a wrong key or a damaged page. */
export interface NativeSqlitePageAuthenticationError extends Typed<"SqlitePageAuthenticationError"> {
  /** The database page, counting from 1, also for a page in a journal. */
  readonly pageNumber: number;
}

/** SQLite asked for something the codec can't keep encrypted. */
export interface NativeSqliteEncryptionUnsupportedError extends Typed<"SqliteEncryptionUnsupported"> {}

/** The platform's random source failed while the codec wrote a page. */
export interface NativeSqliteRandomSourceError extends Typed<"SqliteRandomSourceError"> {}

/** Why {@link NativeSqliteDatabase.prepare} refused the SQL itself. */
export type NativeSqliteSqlTextError =
  | Typed<"SqliteEmptySqlError">
  | Typed<"SqliteMultipleStatementsError">
  | Typed<"SqliteInvalidSqlText">;

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

/** Dependency wrapper for where the files of the databases are. */
export interface DatabasePathDep {
  /** Returns the absolute path of the file of the database `name`. */
  readonly databasePath: (name: Name) => string;
}

/**
 * Creates the {@link CreateSqliteDriver} of Evolu over a {@link NativeSqlite}
 * binding.
 *
 * A database is the file {@link DatabasePathDep} names, which the driver reads
 * at each open. The `encrypted` mode opens it with the encryption key, the mode
 * without options opens it in plaintext, and the `memory` mode opens a database
 * of its own in memory.
 *
 * One connection of the process holds a file at a time. A platform's
 * `WaitForDatabaseRelease` can wait for another connection to close the file
 * first, but one can still open it between that wait and the open, as a runtime
 * still starting during an early reload does, so an open of a held file tries
 * again, as {@link retryWhileHeld} does, and throws once it's still held 10
 * seconds after the first attempt.
 *
 * The {@link SqliteDriver} contract has no error channel, so the driver throws
 * what the binding throws, such as an `Error` whose cause is a
 * {@link NativeSqliteError} for a wrong key.
 */
export const createNativeSqliteDriver =
  (deps: DatabasePathDep & NativeSqliteDep): CreateSqliteDriver =>
  (name, options) =>
  async (run) => {
    const { nativeSqlite } = deps;
    const path = deps.databasePath(name);
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

    // The statements prepare returned that are still open. Disposing the
    // driver finalizes them before it closes the database, which would
    // finalize them too, so their owner can dispose them afterward, as a Sqlite
    // does after deleteDatabase.
    const statements = new Set<SqliteDriverStatement>();
    disposer.defer(() => {
      using stack = new DisposableStack();
      for (const statement of statements) stack.use(statement);
    });

    const disposables = disposer.move();

    return ok({
      exec: (query) => {
        const statement = database.prepare(query.sql);
        try {
          return statement.run(query.parameters);
        } finally {
          statement.finalize();
        }
      },

      prepare: (sql) => {
        const nativeStatement = database.prepare(sql);
        using statementDisposer = new DisposableStack();
        statementDisposer.defer(() => {
          statements.delete(statement);
          nativeStatement.finalize();
        });
        const statement = disposable<SqliteDriverStatement>(
          { exec: (parameters) => nativeStatement.run(parameters) },
          statementDisposer,
        );
        statements.add(statement);
        return statement;
      },

      iterate: (query, onRow) => {
        // A statement of its own, because onRow can run other statements, the
        // prepared ones among them.
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
