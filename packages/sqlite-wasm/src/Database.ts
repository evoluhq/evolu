/**
 * Evolu's SQLite API: databases and statements over the CApi functions, with
 * typed errors and explicit resource management.
 *
 * Status: {@link createSqliteDatabase} opens Memory databases, and File and
 * EncryptedFile databases on a {@link SqliteVfs} or {@link SqliteEncryptingVfs},
 * which a {@link SahPool} is, and {@link createEncryptedSqliteDatabase} also
 * opens the encrypted databases `@evolu/web` 3 created with
 * `@evolu/sqlite-wasm` 2.2.4 in a pool. The pool's own encryption is tested in
 * Node.js over a fake OPFS against 2.2.4, which creates databases as
 * `@evolu/web` does and leaves a hot journal the pool rolls back, and in
 * Chromium, Firefox and WebKit on real OPFS against 2.2.4.
 *
 * ## Calls
 *
 * - Synchronous. Every call returns when SQLite returns. The only asynchronous
 *   step, deriving a legacy key with WebCrypto, runs between the two opens of
 *   {@link createEncryptedSqliteDatabase}.
 * - Bound once per database. {@link createSqliteDatabase} binds the C functions
 *   and memory helpers it needs and allocates one {@link SqliteScratch}; running
 *   a statement then calls wasm exports directly.
 * - Every fallible call returns a Result. {@link SqliteError} copies
 *   `sqlite3_errmsg` and `sqlite3_extended_errcode` right after the failing
 *   call, before any other call on the connection replaces them. It copies
 *   `sqlite3_error_offset` only for SQLITE_ERROR from prepare, exec or step,
 *   the code of the parser errors that set it, because SQLite keeps an offset
 *   until a later prepare succeeds or a statement resets.
 * - The VFS records the first failure since the last top-level call (open,
 *   prepare, run, exec, export), and {@link SqliteError.cause} carries it. The
 *   database clears the record before each such call. A call that runs inside
 *   another call of a database on the same VFS, as a query a callback runs
 *   does, is not top-level, so it leaves the record to the outer call.
 * - Every call, disposal included, enters wasm through {@link SqliteWasm.call}. An
 *   exception or trap that escapes wasm, such as from a call through a disposed
 *   function pointer, is a defect: it is rethrown, and every later call on any
 *   database of the instance throws without entering wasm, because the C stack
 *   and SQLite's state are left inconsistent. A trap after a File or
 *   EncryptedFile connection opened reaches the caller of the open as a
 *   `SuppressedError` whose `suppressed` is the trap, because the open's
 *   deferred close and the free of its scratch memory are refused as it
 *   unwinds.
 *
 * ## Opening
 *
 * - A Memory database opens `:memory:` on the default VFS.
 * - A File or EncryptedFile database's path is a {@link SqliteVfsPath}, a
 *   canonical path, which SQLite passes to the VFS as it is, never as a URI or
 *   an in-memory database, followed by the name of the VFS.
 * - A File or EncryptedFile database opens its path on its VFS, an EncryptedFile
 *   database keyed as the next section describes. Either then prepares a query
 *   of `sqlite_schema`, because SQLite reads a file only when a statement needs
 *   it. So the open rolls back a hot journal, and fails for a file that is not
 *   a database, with SQLITE_NOTADB, or for a hot journal that cannot be rolled
 *   back.
 * - The database uses its VFS only through {@link SqliteVfs} or
 *   {@link SqliteEncryptingVfs}, so any VFS that implements them can hold it,
 *   and a driver can open each database on the VFS that has it, as
 *   {@link SqliteVfs.getPaths} tells.
 * - Flags are READWRITE, CREATE and EXRESCODE, so failures during the open
 *   already carry extended codes.
 * - When the open fails, the message is read first and then the handle SQLite
 *   returned anyway is closed with `sqlite3_close_v2`. Without a handle, as
 *   when memory runs out, the error is the open's result code.
 *
 * ## Encryption
 *
 * - The VFS encrypts an EncryptedFile database itself, and a {@link SahPool} does
 *   it as SQLite3 Multiple Ciphers' `sqlcipher` scheme did with its default
 *   parameters, those of SQLCipher 4, which `PRAGMA cipher = 'sqlcipher'`
 *   selected in `@evolu/web` 3 with 2.2.4. The open registers the key for the
 *   path with {@link SqliteEncryptingVfs.registerKey} before it enters wasm and
 *   disposes the registration when it returns, by when the VFS has taken the
 *   key for the database file; the module documentation of `SahPool.ts`
 *   describes the pool's format. The key never appears in SQL, a URI, an error
 *   or SQLite's memory, and the caller's key is never modified.
 * - Then `sqlite3_file_control` with SQLITE_FCNTL_RESERVE_BYTES asks for 80 bytes
 *   at the end of each page, where the pool keeps the page's IV and HMAC, which
 *   takes effect for a new database, and `PRAGMA secure_delete = ON` makes
 *   deletes overwrite freed content, as SQLite3 Multiple Ciphers did for every
 *   encrypted connection. A {@link SahPool} refuses to turn it off for an
 *   encrypted database, because a freed page SQLite does not write would fail
 *   to authenticate, as `SahPool.ts` describes.
 * - Registering validates nothing, so the read of `sqlite_schema` checks the key.
 *   A wrong key fails there with SQLITE_NOTADB, from page 1, or with
 *   SQLITE_CORRUPT when the first page of a hot journal is another page, and
 *   {@link SqliteError.cause} is the VFS's {@link SqlitePageAuthenticationError}.
 *   The rollback stops at that first page, which fails to authenticate, so it
 *   writes no page of the journal and keeps the journal for the right key.
 *   Before that page, SQLite truncates the database to the size the journal
 *   records, as the right key's rollback does too. It would extend a shorter
 *   database by one zeroed page, encrypted with the wrong key, but a commit
 *   shrinks the file only after it deletes the journal, and a pool refuses a
 *   VACUUM that would change an encrypted database's page size, so no database
 *   is shorter than its hot journal records.
 * - `@evolu/web` with 2.2.4 ran `PRAGMA key = "x'<hex>'"`, SQLCipher's notation
 *   for a raw key, which SQLite3 Multiple Ciphers 2.2.4 took as a passphrase
 *   because of a bug
 *   (https://github.com/utelle/SQLite3MultipleCiphers/issues/218, fixed in
 *   2.2.5), deriving the key with the `sqlcipher` scheme, so those databases
 *   fail as with a wrong key. {@link createEncryptedSqliteDatabase} then opens
 *   them with the key {@link deriveLegacySqliteKey} derives through
 *   {@link SubtleCryptoDep}, and {@link SqliteEncryptedDatabase.keyDerivation}
 *   says which key opened the database. Nothing rekeys a database.
 * - `@evolu/web` 1.0.1-preview.6 to 2.4.0 also ran `PRAGMA legacy = 4`, so the
 *   databases it encrypted fail with SQLITE_NOTADB, as with a wrong key, since
 *   page 1 is encrypted from byte 16; they have not opened since `@evolu/web`
 *   3.0.0 (see `SahPool.ts`).
 * - Only page 1 of the database or a record of its journal that failed to
 *   authenticate counts as a wrong key. Another page of the database that fails
 *   means that page 1 proved the key and the page is damaged, so it fails with
 *   SQLITE_CORRUPT and that page as the cause, also with the key 2.2.4 derived.
 *   An I/O error fails with its own code, and the VFS's record as its cause,
 *   and a database whose pages authenticate but whose content is malformed
 *   fails with SQLite's code and no cause.
 *
 * ## Statements
 *
 * - SQL is copied into its own memory, which is freed when the call returns,
 *   because SQLite parses it in place and copies a statement's SQL, which a
 *   schema change prepares again, only after the parse. Meanwhile a callback,
 *   such as a collation-needed callback during the parse or a function during a
 *   step of {@link SqliteDatabase.exec}, can run a query on the same database,
 *   and that query reuses the scratch memory.
 * - `sqlite3_prepare_v3` gets the SQL's byte length, counting a NUL terminator,
 *   which spares SQLite a copy, and, for statements
 *   {@link SqliteDatabase.prepare} returns, SQLITE_PREPARE_PERSISTENT. Empty SQL
 *   and SQL with more than one statement are errors, so nothing after the first
 *   statement is silently ignored. SQLite reads SQL only up to a NUL character,
 *   and UTF-8 cannot encode a lone surrogate, which encoding would replace with
 *   U+FFFD, so SQL that contains either fails with
 *   {@link SqliteInvalidSqlTextError} before SQLite sees it, in
 *   {@link SqliteDatabase.exec} too.
 * - A second statement is found by scanning the rest of the SQL as SQLite
 *   3.53.4's tokenizer reads it, not by preparing it, because SQLite applies
 *   many pragmas, such as `foreign_keys`, when it prepares them, so SQL that
 *   fails with {@link SqliteMultipleStatementsError} would still change the
 *   connection. Only semicolons, whitespace, UTF-8 byte order marks and
 *   comments may follow the first statement. A pragma in the first statement
 *   still takes effect when the SQL then fails, as SQLite documents for prepare
 *   (https://sqlite.org/pragma.html).
 * - {@link SqliteDatabase.exec} prepares each statement where the previous one
 *   ended and steps it to completion, so {@link SqliteError.sqlOffset} counts
 *   from the start of the whole SQL.
 * - Parameters are positional. Their number is read once at prepare and a run
 *   with a different number fails, so no binding leaks from a previous run.
 *   {@link SqliteDatabase.exec} binds none, so a statement with a parameter
 *   fails there without running, rather than run with NULL.
 * - Binding: null binds NULL; a 32-bit integer binds with `sqlite3_bind_int`;
 *   another safe integer with `sqlite3_bind_int64`, so it stays INTEGER; any
 *   other number with `sqlite3_bind_double`. Text is encoded with `encodeInto`
 *   and bytes are copied into the scratch memory, both bound with
 *   SQLITE_TRANSIENT and an explicit byte length, so embedded NUL characters
 *   survive and an empty value stays non-NULL. A value that can take more than
 *   64 KiB, counting 3 bytes per UTF-16 code unit of text, is allocated exactly
 *   and handed over with SQLITE_WASM_DEALLOC instead, so the scratch memory
 *   does not keep the size of the largest value, and SQLite does not copy it
 *   twice. Such text is encoded into a new array first, and when JavaScript
 *   cannot allocate it, the run fails with SQLITE_NOMEM and the operation
 *   `bind`, while the instance keeps working, because the encoding runs no
 *   wasm. {@link SqliteDatabase.exec} copies its SQL the same way and fails with
 *   the operation `exec`. SQLite keeps a bound value until its parameter is
 *   bound again, so a run that handed a value over clears the bindings before
 *   it returns, also when it fails, and a prepared statement keeps no large
 *   value between runs, while smaller ones keep the buffers SQLite reuses for
 *   them. A {@link SqliteValue} string may contain a lone surrogate, which UTF-8
 *   cannot encode, so text binds it as U+FFFD, as better-sqlite3 does.
 * - Reading: `sqlite3_column_type` first. INTEGER and FLOAT read with
 *   `sqlite3_column_double`, so no BigInt is created; integers beyond 2^53 lose
 *   precision, as in better-sqlite3. TEXT reads the pointer, then the byte
 *   length, and decodes keeping a leading byte order mark. A BLOB is one copy
 *   into its own `ArrayBuffer`, so it can be transferred. With the type read
 *   first, a NULL pointer is never SQL NULL: for TEXT it is SQLITE_NOMEM, and
 *   for a BLOB it is an empty value unless `sqlite3_errcode`, read right after,
 *   returns SQLITE_NOMEM. A NULL column name is SQLITE_NOMEM too, and so is a
 *   TEXT or BLOB that JavaScript cannot allocate a copy of, whatever error the
 *   engine throws then, because the copy runs no wasm, so the instance keeps
 *   working. Each fails the run with the operation `step`. Rows are
 *   null-prototype objects, so a column named `__proto__` is an ordinary
 *   property, and of columns with the same name, the last one wins.
 * - Column names are read after the first row and cached with the statement's
 *   SQLITE_STMTSTATUS_REPREPARE counter. A schema change re-prepares the
 *   statement, and `SELECT *` then returns other columns, so the names are read
 *   again when the counter changed.
 * - {@link SqliteStatement.run} always resets the statement, so it is reusable
 *   after an error, and ignores the result: SQLITE_OK after SQLITE_DONE, and a
 *   failed step's error again after it. A deferred constraint or commit failure
 *   comes from the last step, so it is not lost. A run whose read fails is cut
 *   short, and its reset completes the statement, so a write with RETURNING is
 *   committed although the run fails.
 * - `changes` compares `sqlite3_total_changes64` before and after the run: 0 when
 *   it did not move, `sqlite3_changes64` otherwise, as in better-sqlite3, and
 *   unlike it also 0 when `sqlite3_stmt_readonly` is true, as for a SELECT
 *   whose function writes. SQLite keeps one count per connection, of the last
 *   INSERT, UPDATE or DELETE that finished, so reading it alone would report a
 *   stale count after a SELECT or DDL. {@link SqliteRunResult.changes} says
 *   which writes the count can come from.
 * - A callback may run queries on the database, but SQLite forbids resetting or
 *   finalizing a statement that is stepping and closing a connection while it
 *   runs. So running or disposing a statement during its own run, and disposing
 *   the database while one of its operations runs, throw before wasm is
 *   entered, and the instance keeps working. A callback installed with
 *   `installWasmFunctions` then fails as a defect.
 *
 * ## Exporting and closing
 *
 * - {@link SqliteDatabase.export} calls `sqlite3_serialize(db, NULL, &size, 0)`
 *   for the main schema, copies the pages into their own `ArrayBuffer` and
 *   frees SQLite's copy. The size has its own memory, because SQLite writes it
 *   before it finalizes its query, whose trace callback can run a query on the
 *   same database. `sqlite3_serialize` does not report a failed allocation to
 *   the connection, so the connection's error is cleared with
 *   `sqlite3_set_errmsg` first, and NULL then fails with the error the
 *   connection reports, or else SQLITE_NOMEM, as when JavaScript cannot
 *   allocate the copy of the pages, which still frees SQLite's copy. SQLite
 *   gives an empty database its first page before copying, so NULL with a size
 *   of 0 and no error is only a database that has no pages and cannot get one,
 *   such as a read-only empty one, which exports as zero bytes. Pages come
 *   through the pager, so an encrypted database exports as plaintext. SQLite
 *   zero-fills a page that fails to read and reports success, so the export of
 *   a File or EncryptedFile database fails when its VFS recorded a failure
 *   during it, caused by the VFS's record: with SQLITE_CORRUPT for a page that
 *   failed to authenticate, a {@link SqlitePageAuthenticationError}, and with
 *   SQLITE_IOERR otherwise.
 * - Disposing a database finalizes its statements that are still open and then
 *   calls `sqlite3_close_v2`, so no deferred close keeps the VFS's files open.
 *
 * @module
 */

import {
  assert,
  brand,
  disposable,
  err,
  exhaustiveCheck,
  ok,
  safelyStringifyUnknownValue,
  String,
  trySync,
  type EncryptionKey,
  type NonNegativeInt,
  type Result,
  type SqliteRow,
  type SqliteValue,
  type Task,
  type Typed,
  type TypeError,
} from "@evolu/common";
import {
  sqlite3_bind_blob,
  sqlite3_bind_double,
  sqlite3_bind_int,
  sqlite3_bind_int64,
  sqlite3_bind_null,
  sqlite3_bind_parameter_count,
  sqlite3_bind_text,
  sqlite3_changes64,
  sqlite3_clear_bindings,
  sqlite3_close_v2,
  sqlite3_column_blob,
  sqlite3_column_bytes,
  sqlite3_column_count,
  sqlite3_column_double,
  sqlite3_column_name,
  sqlite3_column_text,
  sqlite3_column_type,
  sqlite3_errcode,
  sqlite3_errmsg,
  sqlite3_error_offset,
  sqlite3_errstr,
  sqlite3_extended_errcode,
  sqlite3_file_control,
  sqlite3_finalize,
  sqlite3_free,
  sqlite3_get_autocommit,
  sqlite3_open_v2,
  sqlite3_prepare_v3,
  sqlite3_reset,
  sqlite3_serialize,
  sqlite3_set_errmsg,
  sqlite3_step,
  sqlite3_stmt_readonly,
  sqlite3_stmt_status,
  sqlite3_total_changes64,
} from "./CApi.ts";
import {
  SQLITE_BLOB,
  SQLITE_CORRUPT,
  SQLITE_DONE,
  SQLITE_ERROR,
  SQLITE_FCNTL_RESERVE_BYTES,
  SQLITE_FLOAT,
  SQLITE_INTEGER,
  SQLITE_IOERR,
  SQLITE_NOMEM,
  SQLITE_NULL,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_EXRESCODE,
  SQLITE_OPEN_READWRITE,
  SQLITE_PREPARE_PERSISTENT,
  SQLITE_ROW,
  SQLITE_STMTSTATUS_REPREPARE,
  SQLITE_TEXT,
  SQLITE_TRANSIENT,
  SQLITE_WASM_DEALLOC,
  type SqlitePrimaryResultCode,
  type SqliteResultCode,
} from "./Constants.ts";
import {
  allocCString,
  allocWasm,
  copyWasmBytes,
  createSqliteScratch,
  isInt32,
  readCString,
  readUtf8,
  writeUtf8,
  writeWasmBytes,
  type SqliteScratch,
} from "./Memory.ts";
import type {
  CStringPtr,
  SqliteDbPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "./Pointer.ts";
import {
  sahPoolMaxDatabasePathSize,
  type SahPool,
  type SahPoolEncryptionUnsupportedError,
  type SahPoolFullError,
  type SahPoolInvalidPathError,
} from "./SahPool.ts";
import type { SqliteWasm, SqliteWasmDep } from "./Wasm.ts";

/**
 * An open SQLite database. Disposing it while one of its operations runs, as
 * from a callback, throws.
 */
export interface SqliteDatabase extends Disposable {
  /** Prepares one statement for repeated runs. */
  readonly prepare: (
    sql: string,
  ) => Result<SqliteStatement, SqlitePrepareError>;

  /**
   * Prepares one statement, runs it once as {@link SqliteStatement.run} does and
   * finalizes it.
   *
   * Without SQLITE_PREPARE_PERSISTENT, SQLite prepares it from its lookaside
   * memory, so a statement that runs once is faster than one from
   * {@link SqliteDatabase.prepare}: about 20% for a typical query in Node.js
   * 24.
   */
  readonly run: (
    sql: string,
    parameters: ReadonlyArray<SqliteValue>,
  ) => Result<SqliteRunResult, SqlitePrepareError | SqliteRunError>;

  /**
   * Runs SQL that can hold several statements, without parameters, and discards
   * any rows. Meant for schema changes and pragmas.
   *
   * It runs the statements in order and stops at the first that fails. A
   * statement with a parameter fails with {@link SqliteParameterCountError}
   * without running, so no parameter silently binds NULL.
   */
  readonly exec: (sql: string) => Result<void, SqliteExecError>;

  /**
   * Returns the whole database as bytes backed by their own `ArrayBuffer`, so
   * they can be transferred to another worker.
   */
  readonly export: () => Result<Uint8Array<ArrayBuffer>, SqliteError>;

  /**
   * Whether no transaction is open.
   *
   * After errors such as SQLITE_FULL, SQLITE_IOERR or SQLITE_NOMEM, SQLite may
   * roll back the transaction itself, and a ROLLBACK then fails. A transaction
   * helper checks this before rolling back.
   */
  readonly isAutocommit: () => boolean;
}

/**
 * A prepared statement. Running or disposing it during its own run, as from a
 * callback, throws.
 */
export interface SqliteStatement extends Disposable {
  /** The number of SQL parameters, which each run must supply exactly. */
  readonly parameterCount: number;

  /**
   * Binds the parameters, steps to completion, collects the rows and resets the
   * statement, also when a step fails.
   */
  readonly run: (
    parameters: ReadonlyArray<SqliteValue>,
  ) => Result<SqliteRunResult, SqliteRunError>;
}

/** The result of {@link SqliteStatement.run}. */
export interface SqliteRunResult {
  readonly rows: ReadonlyArray<SqliteRow>;
  /**
   * 0 for a read-only statement or a run that changed no rows, and otherwise
   * SQLite's `sqlite3_changes64`: the rows the connection's last INSERT, UPDATE
   * or DELETE that finished changed, without those of triggers, foreign key
   * actions or REPLACE. For an INSERT, UPDATE or DELETE, that is its own count,
   * unless a write on the same connection finished after it within the run, as
   * one its profile trace callback runs. For another statement, it is the count
   * of the last write that finished during the run, as one by a function it
   * calls or by its trace callback.
   */
  readonly changes: number;
}

/** An error SQLite reported. */
export interface SqliteError extends Typed<"SqliteError"> {
  readonly operation: SqliteOperation;
  /**
   * The extended result code, whose primary result code
   * {@link sqliteResultCodeToPrimary} returns.
   */
  readonly extendedCode: SqliteResultCode;
  /**
   * From `sqlite3_errmsg`, or from `sqlite3_errstr` of the code when SQLite did
   * not report the failure to the connection, as for an open without a handle,
   * an allocation that failed, or an export whose VFS failed to read a page.
   */
  readonly message: string;
  /**
   * The byte offset in the UTF-8 SQL where SQLite detected the error, from
   * `sqlite3_error_offset` for a parser error (SQLITE_ERROR from prepare, exec
   * or step); null for any other error or when the error has no position.
   */
  readonly sqlOffset: number | null;
  /**
   * The first VFS failure since the top-level operation started, such as the
   * `QuotaExceededError` behind SQLITE_FULL; null when the VFS reported none.
   */
  readonly cause: SqliteVfsFailure | null;
}

/** The operation a {@link SqliteError} comes from. */
export type SqliteOperation =
  "open" | "prepare" | "bind" | "step" | "exec" | "export";

/**
 * Returns the primary result code of a result code, its low 8 bits, such as
 * SQLITE_CONSTRAINT for SQLITE_CONSTRAINT_NOTNULL. A primary result code
 * returns itself.
 */
export const sqliteResultCodeToPrimary = (
  code: SqliteResultCode,
): SqlitePrimaryResultCode => (code & 0xff) as SqlitePrimaryResultCode;

/** A failure a VFS method recorded before returning an error code. */
export interface SqliteVfsFailure {
  readonly method: SqliteVfsMethod;
  /**
   * The path of the file, or null for a method without one or a name that maps
   * to no path.
   */
  readonly path: string | null;
  /**
   * What the browser threw, such as a `DOMException`, or what the VFS found
   * wrong, such as a {@link SqliteShortWriteError}, a
   * {@link SqlitePageAuthenticationError}, a {@link SahPoolFullError}, a
   * {@link SahPoolInvalidPathError}, or a
   * {@link SahPoolEncryptionUnsupportedError}.
   */
  readonly error: unknown;
}

/** A VFS or I/O method that can record a {@link SqliteVfsFailure}. */
export type SqliteVfsMethod =
  | "xOpen"
  | "xDelete"
  | "xAccess"
  | "xClose"
  | "xRead"
  | "xWrite"
  | "xTruncate"
  | "xSync"
  | "xFileSize"
  | "xLock"
  | "xUnlock"
  | "xCheckReservedLock"
  | "xFileControl";

/**
 * A write that stored fewer or more bytes than requested.
 *
 * Firefox reports a full disk with a short count, and Chromium's off-the-record
 * storage has reported impossible counts; either way the data is not all there,
 * so the write fails with SQLITE_FULL.
 */
export interface SqliteShortWriteError extends Typed<"SqliteShortWrite"> {
  readonly requested: number;
  readonly written: number;
}

/** Why {@link SqliteDatabase.prepare} failed. */
export type SqlitePrepareError =
  | SqliteError
  | SqliteEmptySqlError
  | SqliteMultipleStatementsError
  | SqliteInvalidSqlTextError;

/** The SQL contains no statement, only whitespace or comments. */
export interface SqliteEmptySqlError extends Typed<"SqliteEmptySqlError"> {}

/** The SQL contains more than one statement. */
export interface SqliteMultipleStatementsError extends Typed<"SqliteMultipleStatementsError"> {}

/**
 * The SQL is text SQLite would read as other SQL, so it fails before SQLite
 * sees it: it contains a NUL character, which SQLite reads SQL only up to, so
 * it would silently ignore the rest, or a lone surrogate, which UTF-8 cannot
 * encode, so it would run with U+FFFD in its place.
 */
export interface SqliteInvalidSqlTextError extends Typed<"SqliteInvalidSqlText"> {}

/** Why {@link SqliteDatabase.exec} failed. */
export type SqliteExecError =
  SqliteError | SqliteInvalidSqlTextError | SqliteParameterCountError;

/** Why {@link SqliteStatement.run} failed. */
export type SqliteRunError = SqliteError | SqliteParameterCountError;

/**
 * A run supplied a different number of parameters than the SQL has, or
 * {@link SqliteDatabase.exec}, which supplies none, met a statement with
 * parameters.
 */
export interface SqliteParameterCountError extends Typed<"SqliteParameterCountError"> {
  readonly expected: number;
  readonly actual: number;
}

/** How to open a database. */
export type SqliteDatabaseOptions =
  | SqliteMemoryDatabaseOptions
  | SqliteFileDatabaseOptions
  | SqliteEncryptedFileDatabaseOptions;

/**
 * An in-memory database on the default VFS, which never touches OPFS. Temporary
 * tables and indexes stay in memory in every mode.
 */
export interface SqliteMemoryDatabaseOptions extends Typed<"Memory"> {}

/** An unencrypted database file on a {@link SqliteVfs}, such as a {@link SahPool}. */
export interface SqliteFileDatabaseOptions extends Typed<"File"> {
  readonly vfs: SqliteVfs;
  /**
   * The canonical path of the file on the VFS, such as `/evolu1.db`, by which
   * the VFS also lists and deletes it.
   */
  readonly path: SqliteVfsPath;
}

/**
 * A database file on a {@link SqliteEncryptingVfs}, which encrypts it, as a
 * {@link SahPool} does in the format of SQLite3 Multiple Ciphers' `sqlcipher`
 * scheme.
 *
 * Only the database file and its journal are encrypted. `VACUUM INTO` and
 * `ATTACH` open their file as a database of its own, which is encrypted only
 * when a key is registered for its path with
 * {@link SqliteEncryptingVfs.registerKey} while they open it. Otherwise they
 * write it unencrypted, because SQLite ignores the `KEY` clause of `ATTACH` and
 * `PRAGMA key`, `rekey` and `cipher`, where 2.2.4 encrypted both with the
 * database's key, or with the `KEY` of `ATTACH`. A file that `ATTACH` creates
 * cannot be encrypted, because SQLite reserves no bytes in it, so with a key
 * registered its first write fails with SQLITE_IOERR_WRITE. `VACUUM INTO` keeps
 * the reserved bytes, so it can create an encrypted copy, which `ATTACH` then
 * opens with its key registered.
 */
export interface SqliteEncryptedFileDatabaseOptions extends Typed<"EncryptedFile"> {
  readonly vfs: SqliteEncryptingVfs;
  /**
   * The path of the file on the VFS, as {@link SqliteFileDatabaseOptions.path}
   * describes.
   */
  readonly path: SqliteVfsPath;
  /**
   * The raw key, which {@link SqliteEncryptingVfs.registerKey} gets while the
   * file opens.
   */
  readonly key: EncryptionKey;
}

/** Error returned when a string is not a valid {@link SqliteVfsPath}. */
export interface SqliteVfsPathError extends TypeError<"SqliteVfsPath"> {
  readonly value: string;
}

/**
 * The canonical path of a database file on a {@link SqliteVfs}, such as
 * `/evolu1.db`, one spelling per file, as {@link SqliteVfs.getPaths} lists it.
 *
 * A path is canonical when it is its own `new URL(path,
 * "file://localhost/").pathname`, the path a {@link SahPool} maps a name to, so
 * the VFS opens, lists and deletes the file by the path the database opened it
 * with, and an EncryptedFile database registers its key for that file. A
 * canonical path starts with `/` and is printable ASCII without `?` or `#`, so
 * SQLite passes it to the VFS as it is, and the paths SQLite derives from it by
 * appending a suffix, as for the journal, are canonical too. It rejects:
 *
 * - Another spelling of a path, such as `evolu1.db`, `/x/../evolu1.db`,
 *   `FILE:evolu1.db` or `/a b.db` for `/a%20b.db`, and a name with a scheme,
 *   such as `db:evolu1.db`, which a pool would map to the relative path
 *   `evolu1.db`.
 * - A path SQLite reads itself: an empty path and `:memory:`, which open an
 *   in-memory database, `:localStorage:` and `:sessionStorage:`, which SQLite
 *   opens on its kvvfs, and a `file:` URI, whose query and fragment SQLite
 *   strips and whose escapes it decodes, so the VFS would get another name, and
 *   an EncryptedFile database would be written without its key.
 * - A path longer than {@link sahPoolMaxDatabasePathSize}, 498 bytes, because a
 *   pool slot's header holds a path of up to 510 bytes, and SQLite names a
 *   super-journal by appending 12 bytes to the database's path.
 */
export const SqliteVfsPath = /*#__PURE__*/ brand(
  "SqliteVfsPath",
  String,
  (value) => {
    const canonical = trySync(
      () => new URL(value, "file://localhost/").pathname,
      () => null,
    );
    // A canonical path is ASCII, because a URL path percent-encodes every other
    // character, so its length is its length in UTF-8.
    return canonical.ok &&
      canonical.value === value &&
      value.length <= sahPoolMaxDatabasePathSize
      ? ok()
      : err<SqliteVfsPathError>({ type: "SqliteVfsPath", value });
  },
  (error) =>
    `The value ${safelyStringifyUnknownValue(error.value)} is not a valid SqliteVfsPath.`,
);
export type SqliteVfsPath = typeof SqliteVfsPath.Output;

/**
 * What a database needs from the VFS it opens a file on, and what a driver
 * needs to tell which databases the VFS has and to delete them. A
 * {@link SahPool} is one.
 */
export interface SqliteVfs {
  /** The name of the VFS, which a database opens its path with. */
  readonly vfsName: string;

  /**
   * Returns the first failure a method of the VFS recorded since the last
   * {@link SqliteVfs.clearFailure}, which a {@link SqliteError} carries as its
   * cause.
   */
  readonly getFailure: () => SqliteVfsFailure | null;

  /**
   * Forgets the recorded failure; a database calls it before each operation
   * that does not run inside another operation on the VFS.
   */
  readonly clearFailure: () => void;

  /**
   * Returns the canonical paths of the files the VFS has, databases and their
   * journals, such as `/evolu1.db`, so a database opened at a
   * {@link SqliteVfsPath} is listed by that path. A VFS may derive a file's
   * canonical path from the name SQLite opened it with, as a {@link SahPool}
   * lists a file SQLite's opfs-sahpool opened as `evolu1.db` as `/evolu1.db`.
   */
  readonly getPaths: () => ReadonlyArray<string>;

  /**
   * Deletes the file with a canonical path, as {@link SqliteVfs.getPaths}
   * returns it, and the files SQLite keeps beside it, such as its `-journal`.
   * The file goes first, so a failure never leaves a database without the
   * journal that would roll it back. Returns false when the VFS has no file
   * with the path, as for a path that is not canonical, and throws when a
   * connection has one of the files open.
   */
  readonly unlink: (path: string) => Result<boolean, SqliteVfsIoError>;
}

/**
 * A {@link SqliteVfs} that encrypts a database file whose path has a key
 * registered while the file opens, as an EncryptedFile database needs.
 *
 * The database asks SQLite to leave the last 80 bytes of each page of a new
 * database unused, so the VFS can store data of its own there, as a
 * {@link SahPool} stores the page's IV and HMAC.
 *
 * A read of a page that fails to authenticate fails with SQLITE_NOTADB for page
 * 1 and SQLITE_CORRUPT for any other page, and records a
 * {@link SqlitePageAuthenticationError}, by which the database tells it from
 * other failures, so an export that reads the page fails with SQLITE_CORRUPT
 * rather than SQLITE_IOERR.
 */
export interface SqliteEncryptingVfs extends SqliteVfs {
  /**
   * Registers a raw key for a path until the registration is disposed, as an
   * EncryptedFile database does while it opens. The path is the one spelling by
   * which the VFS opens the file, so it is registered as it is. When the VFS
   * opens the path as a main database, it copies the key and encrypts that file
   * and its journal with it until the file closes, also for the file of an
   * `ATTACH` or `VACUUM INTO` that opens it meanwhile. The caller's key is
   * never modified.
   */
  readonly registerKey: (path: SqliteVfsPath, key: EncryptionKey) => Disposable;
}

/**
 * The storage of a VFS failed outside SQLite, as when {@link SqliteVfs.unlink}
 * deletes a file.
 */
export interface SqliteVfsIoError extends Typed<"SqliteVfsIoError"> {
  /**
   * What the storage threw, such as a `DOMException`, or a
   * {@link SqliteShortWriteError} for a write that stored a different number of
   * bytes.
   */
  readonly cause: unknown;
}

/**
 * A page of an encrypted file that failed to authenticate, because the key is
 * wrong or the page was altered or cut short, as a {@link SqliteEncryptingVfs}
 * records it.
 */
export interface SqlitePageAuthenticationError extends Typed<"SqlitePageAuthenticationError"> {
  /**
   * The number of the database page, counting from 1, also for a page in a
   * journal.
   */
  readonly pageNumber: number;
}

/**
 * Opens a database.
 *
 * With a wrong key or a file that is not a database, it fails with
 * SQLITE_NOTADB, or with SQLITE_CORRUPT for a wrong key and a hot journal whose
 * first record is not page 1. On a {@link SahPool}, an encrypted database opened
 * without its key while it has a hot journal that records pages fails with
 * SQLITE_CANTOPEN, and the journal stays for the key. A leftover journal that
 * is not hot, such as one `journal_mode = PERSIST` or TRUNCATE keeps, gives
 * SQLITE_NOTADB, as no journal does. For encrypted databases that 2.2.4 may
 * have keyed, use {@link createEncryptedSqliteDatabase}.
 */
export const createSqliteDatabase =
  (deps: SqliteWasmDep) =>
  (options: SqliteDatabaseOptions): Result<SqliteDatabase, SqliteError> => {
    const { call } = deps.sqliteWasm;
    const vfs = options.type === "Memory" ? null : options.vfs;

    // The operations of this database that are running, as one that a
    // callback of another runs, so the database is not disposed under them.
    let runningOperations = 0;

    // The VFS takes the key when SQLite opens the file. Registered before wasm
    // is entered, so a VFS that refuses it, as a pool with a key already
    // registered for the path does, throws without breaking the instance.
    using _registration =
      options.type === "EncryptedFile"
        ? options.vfs.registerKey(options.path, options.key)
        : null;

    // Clears the VFS's failure record and then calls an operation through
    // call, so the cause of a SqliteError is a failure of this operation. A
    // VFS that throws, as a disposed pool does, then throws before wasm is
    // entered, without breaking the instance. An operation inside another on
    // the same VFS, as a query a callback runs, keeps the record, which the
    // outer operation still reads.
    const callOperation = <T>(fn: () => T): T => {
      runningOperations++;
      try {
        if (vfs == null) return call(fn);
        const running = runningOperationsByVfs.get(vfs) ?? 0;
        if (running === 0) vfs.clearFailure();
        runningOperationsByVfs.set(vfs, running + 1);
        try {
          return call(fn);
        } finally {
          runningOperationsByVfs.set(vfs, running);
        }
      } finally {
        runningOperations--;
      }
    };
    return callOperation(() => {
      const bindBlob = sqlite3_bind_blob(deps);
      const bindDouble = sqlite3_bind_double(deps);
      const bindInt = sqlite3_bind_int(deps);
      const bindInt64 = sqlite3_bind_int64(deps);
      const bindNull = sqlite3_bind_null(deps);
      const bindParameterCount = sqlite3_bind_parameter_count(deps);
      const bindText = sqlite3_bind_text(deps);
      const changes64 = sqlite3_changes64(deps);
      const clearBindings = sqlite3_clear_bindings(deps);
      const closeV2 = sqlite3_close_v2(deps);
      const columnBlob = sqlite3_column_blob(deps);
      const columnBytes = sqlite3_column_bytes(deps);
      const columnCount = sqlite3_column_count(deps);
      const columnDouble = sqlite3_column_double(deps);
      const columnName = sqlite3_column_name(deps);
      const columnText = sqlite3_column_text(deps);
      const columnType = sqlite3_column_type(deps);
      const errcode = sqlite3_errcode(deps);
      const errmsg = sqlite3_errmsg(deps);
      const errorOffset = sqlite3_error_offset(deps);
      const errstr = sqlite3_errstr(deps);
      const extendedErrcode = sqlite3_extended_errcode(deps);
      const finalize = sqlite3_finalize(deps);
      const free = sqlite3_free(deps);
      const getAutocommit = sqlite3_get_autocommit(deps);
      const prepareV3 = sqlite3_prepare_v3(deps);
      const reset = sqlite3_reset(deps);
      const serialize = sqlite3_serialize(deps);
      const setErrmsg = sqlite3_set_errmsg(deps);
      const step = sqlite3_step(deps);
      const stmtReadonly = sqlite3_stmt_readonly(deps);
      const stmtStatus = sqlite3_stmt_status(deps);
      const totalChanges64 = sqlite3_total_changes64(deps);
      const alloc = allocWasm(deps);
      const allocString = allocCString(deps);
      const copyBytes = copyWasmBytes(deps);
      const readString = readCString(deps);
      const readText = readUtf8(deps);
      const writeBytes = writeWasmBytes(deps);
      const writeText = writeUtf8(deps);

      const statements = new Set<SqliteStatement>();

      // Reads the connection's error right after the failing call, before any
      // other call replaces it.
      const toSqliteError = (
        db: SqliteDbPtr,
        operation: SqliteOperation,
      ): SqliteError => {
        const extendedCode = extendedErrcode(db);
        // SQLite sets the offset only for parser errors and keeps it until a
        // prepare succeeds or a statement resets or finalizes, so any other code
        // or operation would read the offset of an earlier failed prepare.
        const offset =
          sqliteResultCodeToPrimary(extendedCode) === SQLITE_ERROR &&
          (operation === "prepare" ||
            operation === "exec" ||
            operation === "step")
            ? errorOffset(db)
            : -1;
        return {
          type: "SqliteError",
          operation,
          extendedCode,
          // SQLite falls back to sqlite3_errstr, so it is never NULL.
          message: readString(errmsg(db) as CStringPtr),
          sqlOffset: offset < 0 ? null : offset,
          cause: vfs?.getFailure() ?? null,
        };
      };

      // For a failure without a connection that could report it.
      const toCodeError = (
        operation: SqliteOperation,
        extendedCode: SqliteResultCode,
      ): SqliteError => ({
        type: "SqliteError",
        operation,
        extendedCode,
        // SQLite describes an unknown code as "unknown error", never NULL.
        message: readString(errstr(extendedCode) as CStringPtr),
        sqlOffset: null,
        cause: null,
      });

      const readPtr = (ptr: WasmPtr): number =>
        deps.sqliteWasm.getHeapDataView().getUint32(ptr, true);

      using disposer = new DisposableStack();
      const createdScratch = createSqliteScratch(deps);
      if (!createdScratch.ok) return err(toCodeError("open", SQLITE_NOMEM));
      const scratch = createdScratch.value;
      disposer.defer(() => {
        call(() => {
          scratch[Symbol.dispose]();
        });
      });
      const pzTail = (scratch.out + 4) as WasmPtr;

      // A File or EncryptedFile database's path is followed by the name of its
      // VFS.
      const filename = allocString(
        options.type === "Memory"
          ? ":memory:"
          : `${options.path}\0${options.vfs.vfsName}`,
      );
      if (!filename.ok) return err(toCodeError("open", SQLITE_NOMEM));
      const zFilename = filename.value;
      const pathEnd = deps.sqliteWasm.getHeapU8().indexOf(0, zFilename);
      const rc = (() => {
        using filenameDisposer = new DisposableStack();
        filenameDisposer.defer(() => {
          free(zFilename);
        });
        return sqlite3_open_v2(deps)(
          zFilename,
          scratch.out,
          SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_EXRESCODE,
          options.type === "Memory" ? 0 : ((pathEnd + 1) as CStringPtr),
        );
      })();
      const db = readPtr(scratch.out) as SqliteDbPtr;
      if (rc !== SQLITE_OK) {
        const error =
          db === 0 ? toCodeError("open", rc) : toSqliteError(db, "open");
        closeV2(db);
        return err(error);
      }
      disposer.defer(() => {
        call(() => closeV2(db));
      });
      // Finalized before the close, so no deferred close keeps files open.
      disposer.defer(() => {
        for (const statement of statements) statement[Symbol.dispose]();
      });

      const prepareStatement = (
        sql: string,
        prepFlags: number,
        operation: "prepare" | "open" = "prepare",
      ): Result<SqliteStmtPtr, SqlitePrepareError> => {
        if (!isValidSqlText(sql)) return err({ type: "SqliteInvalidSqlText" });
        // SQLite parses the SQL in place, while a callback can run a query on
        // this database, which reuses the scratch memory. Three bytes per
        // UTF-16 code unit hold any UTF-8, and encoding into them is faster
        // than allocCString's exact copy, which encodes into a temporary array
        // first. A run prepares SQL every time, so it is a hot path.
        const capacity = sql.length * 3;
        const allocated = alloc(capacity + 1);
        if (!allocated.ok) return err(toCodeError(operation, SQLITE_NOMEM));
        const zSql = allocated.value;
        try {
          const written = writeText(sql, zSql, capacity);
          deps.sqliteWasm.getHeapU8()[zSql + written] = 0;
          const rc = prepareV3(
            db,
            zSql,
            written + 1,
            prepFlags,
            scratch.out,
            pzTail,
          );
          if (rc !== SQLITE_OK) return err(toSqliteError(db, operation));
          const stmt = readPtr(scratch.out) as SqliteStmtPtr;
          if (stmt === 0) return err({ type: "SqliteEmptySqlError" });
          // The rest is scanned, not prepared, because SQLite applies some
          // pragmas, such as foreign_keys, when it prepares them.
          if (
            !isEmptySql(
              deps.sqliteWasm.getHeapU8(),
              readPtr(pzTail),
              zSql + written,
            )
          ) {
            finalize(stmt);
            return err({ type: "SqliteMultipleStatementsError" });
          }
          return ok(stmt);
        } finally {
          free(zSql);
        }
      };

      // The steps after the connection opened run in a call of their own, so
      // a trap in them breaks the instance before it unwinds to the deferred
      // close, which then refuses to close the connection on the state the
      // trap left.
      const prepared = call((): Result<void, SqliteError> => {
        if (options.type === "EncryptedFile") {
          // The IV and the HMAC at the end of each page, for a new database. It
          // returns SQLITE_OK for main, a NULL schema name, and an existing
          // database keeps what its header says.
          deps.sqliteWasm
            .getHeapDataView()
            .setInt32(scratch.out, encryptedReservedBytes, true);
          sqlite3_file_control(deps)(
            db,
            0,
            SQLITE_FCNTL_RESERVE_BYTES,
            scratch.out,
          );
          // As SQLite3 Multiple Ciphers did for every encrypted connection.
          const secureDelete = prepareStatement(
            "PRAGMA secure_delete = ON",
            0,
            "open",
          );
          if (!secureDelete.ok) {
            assert(
              secureDelete.error.type === "SqliteError",
              "The pragma is one statement.",
            );
            return err(secureDelete.error);
          }
          const stepped = step(secureDelete.value);
          const error =
            stepped === SQLITE_ROW ? null : toSqliteError(db, "open");
          finalize(secureDelete.value);
          if (error) return err(error);
        }

        // SQLite reads a file only when a statement needs it, so a File or
        // EncryptedFile database reads its schema now: a hot journal is rolled
        // back, and a file that is not a database fails the open rather than the
        // first statement.
        if (options.type !== "Memory") {
          const schema = prepareStatement(
            "SELECT 1 FROM sqlite_schema",
            0,
            "open",
          );
          if (!schema.ok) {
            assert(
              schema.error.type === "SqliteError",
              "The schema query is one statement.",
            );
            return err(schema.error);
          }
          finalize(schema.value);
        }
        return ok();
      });
      if (!prepared.ok) return err(prepared.error);

      const createRunner = (stmt: SqliteStmtPtr) => {
        const parameterCount = bindParameterCount(stmt);
        let names: ReadonlyArray<string> | null = null;
        let namesReprepares = 0;

        const run = (
          parameters: ReadonlyArray<SqliteValue>,
        ): Result<SqliteRunResult, SqliteRunError> => {
          if (parameters.length !== parameterCount)
            return err({
              type: "SqliteParameterCountError",
              expected: parameterCount,
              actual: parameters.length,
            });
          // SQLite keeps a bound value until its parameter is bound again, so
          // a run that handed SQLite a value above 64 KiB clears the bindings
          // before it returns, also when it fails.
          let clearsBindings = false;
          let bindError: SqliteError | null = null;
          for (const [index, value] of parameters.entries()) {
            const position = index + 1;
            let bindRc: SqliteResultCode;
            if (value === null) bindRc = bindNull(stmt, position);
            else if (typeof value === "number")
              bindRc = isInt32(value)
                ? bindInt(stmt, position, value)
                : Number.isSafeInteger(value)
                  ? bindInt64(stmt, position, BigInt(value))
                  : bindDouble(stmt, position, value);
            else if (
              typeof value === "string" &&
              value.length * 3 <= maxScratchValue
            ) {
              const reserved = scratch.reserve(value.length * 3);
              if (!reserved.ok) {
                bindError = toCodeError("bind", SQLITE_NOMEM);
                break;
              }
              const length = writeText(value, reserved.value, value.length * 3);
              bindRc = bindText(
                stmt,
                position,
                reserved.value,
                length,
                SQLITE_TRANSIENT,
              );
            } else if (typeof value === "string") {
              // JavaScript can fail to allocate the UTF-8, which runs no wasm,
              // so the instance keeps working.
              const bytes = trySync(() => utf8Encoder.encode(value));
              if (!bytes.ok) {
                bindError = toCodeError("bind", SQLITE_NOMEM);
                break;
              }
              const allocated = alloc(bytes.value.length);
              if (!allocated.ok) {
                bindError = toCodeError("bind", SQLITE_NOMEM);
                break;
              }
              writeBytes(allocated.value, bytes.value);
              clearsBindings = true;
              bindRc = bindText(
                stmt,
                position,
                allocated.value,
                bytes.value.length,
                SQLITE_WASM_DEALLOC,
              );
            } else if (value.length <= maxScratchValue) {
              const reserved = scratch.reserve(value.length);
              if (!reserved.ok) {
                bindError = toCodeError("bind", SQLITE_NOMEM);
                break;
              }
              writeBytes(reserved.value, value);
              bindRc = bindBlob(
                stmt,
                position,
                reserved.value,
                value.length,
                SQLITE_TRANSIENT,
              );
            } else {
              const allocated = alloc(value.length);
              if (!allocated.ok) {
                bindError = toCodeError("bind", SQLITE_NOMEM);
                break;
              }
              writeBytes(allocated.value, value);
              clearsBindings = true;
              bindRc = bindBlob(
                stmt,
                position,
                allocated.value,
                value.length,
                SQLITE_WASM_DEALLOC,
              );
            }
            if (bindRc !== SQLITE_OK) {
              bindError = toSqliteError(db, "bind");
              break;
            }
          }
          if (bindError) {
            if (clearsBindings) clearBindings(stmt);
            return err(bindError);
          }

          const totalChanges = totalChanges64(db);
          const rows: Array<SqliteRow> = [];
          let rc: SqliteResultCode;
          // A read that fails because SQLite is out of memory leaves the loop
          // with SQLITE_ROW.
          steps: while ((rc = step(stmt)) === SQLITE_ROW) {
            // A schema change re-prepares the statement, and SELECT * can then
            // return other columns, so the first row checks the counter.
            const reprepares =
              rows.length === 0
                ? stmtStatus(stmt, SQLITE_STMTSTATUS_REPREPARE, 0)
                : namesReprepares;
            if (names == null || reprepares !== namesReprepares) {
              const columnNames: Array<string> = [];
              for (let index = 0; index < columnCount(stmt); index++) {
                const name = columnName(stmt, index);
                if (name === 0) break steps;
                columnNames.push(readString(name));
              }
              names = columnNames;
              namesReprepares = reprepares;
            }
            const row = Object.create(null) as SqliteRow;
            for (const [index, name] of names.entries()) {
              // With the type read first, a NULL pointer is never SQL NULL.
              const type = columnType(stmt, index);
              switch (type) {
                case SQLITE_INTEGER:
                case SQLITE_FLOAT:
                  row[name] = columnDouble(stmt, index);
                  break;
                case SQLITE_TEXT: {
                  const ptr = columnText(stmt, index);
                  if (ptr === 0) break steps;
                  const text = tryCopy(readText, ptr, columnBytes(stmt, index));
                  if (text == null) break steps;
                  row[name] = text;
                  break;
                }
                case SQLITE_BLOB: {
                  const ptr = columnBlob(stmt, index);
                  // NULL for an empty BLOB too.
                  if (ptr !== 0) {
                    const bytes = tryCopy(
                      copyBytes,
                      ptr,
                      columnBytes(stmt, index),
                    );
                    if (bytes == null) break steps;
                    row[name] = bytes;
                  } else if (errcode(db) === SQLITE_NOMEM) break steps;
                  else row[name] = new Uint8Array();
                  break;
                }
                case SQLITE_NULL:
                  row[name] = null;
                  break;
                default:
                  exhaustiveCheck(type);
              }
            }
            rows.push(row);
          }
          const error =
            rc === SQLITE_DONE
              ? null
              : rc === SQLITE_ROW
                ? toCodeError("step", SQLITE_NOMEM)
                : toSqliteError(db, "step");
          // After SQLITE_DONE it returns SQLITE_OK, and after a failure it
          // repeats it, so its result is ignored.
          reset(stmt);
          if (clearsBindings) clearBindings(stmt);
          if (error) return err(error);
          // SQLite keeps the count of the last INSERT, UPDATE or DELETE across
          // other statements, also one that a function of this statement ran,
          // and a statement that cannot write changes no rows itself.
          const changes =
            totalChanges64(db) === totalChanges || stmtReadonly(stmt) !== 0
              ? 0
              : Number(changes64(db));
          return ok({ rows, changes });
        };

        return { parameterCount, run };
      };

      const database = disposable<SqliteDatabase>(
        {
          prepare: (sql) =>
            callOperation(() => {
              const prepared = prepareStatement(sql, SQLITE_PREPARE_PERSISTENT);
              if (!prepared.ok) return prepared;
              const stmt = prepared.value;
              const runner = createRunner(stmt);
              // SQLite forbids resetting or finalizing a statement that is
              // stepping, which running or disposing it from a callback of its
              // run would do. Both throw before wasm is entered, so the
              // instance keeps working.
              let running = false;
              using statementDisposer = new DisposableStack();
              statementDisposer.defer(() => {
                statements.delete(statement);
                call(() => finalize(stmt));
              });
              const statement = disposable<SqliteStatement>(
                {
                  parameterCount: runner.parameterCount,
                  run: (parameters) => {
                    if (running) throw new Error(runningStatementMessage);
                    running = true;
                    try {
                      return callOperation(() => runner.run(parameters));
                    } finally {
                      running = false;
                    }
                  },
                },
                statementDisposer,
              );
              const disposeStatement = statement[Symbol.dispose];
              statement[Symbol.dispose] = () => {
                if (running) throw new Error(runningStatementMessage);
                disposeStatement();
              };
              statements.add(statement);
              return ok(statement);
            }),

          run: (sql, parameters) =>
            callOperation(() => {
              const prepared = prepareStatement(sql, 0);
              if (!prepared.ok) return prepared;
              const result = createRunner(prepared.value).run(parameters);
              finalize(prepared.value);
              return result;
            }),

          exec: (sql) =>
            callOperation(() => {
              if (!isValidSqlText(sql))
                return err({ type: "SqliteInvalidSqlText" });
              // A step can call back into this connection, as a function that runs
              // a query does, and that call reuses the scratch memory, so the
              // statements not yet prepared need their own copy. JavaScript can
              // fail to allocate the UTF-8, which runs no wasm, so the instance
              // keeps working.
              const bytes = trySync(() => utf8Encoder.encode(sql));
              if (!bytes.ok) return err(toCodeError("exec", SQLITE_NOMEM));
              const copied = alloc(bytes.value.length + 1);
              if (!copied.ok) return err(toCodeError("exec", SQLITE_NOMEM));
              const zSql = copied.value;
              using execDisposer = new DisposableStack();
              execDisposer.defer(() => {
                free(zSql);
              });
              writeBytes(zSql, bytes.value);
              // The lengths SQLite gets count the NUL terminator, as in
              // prepare.
              const end = zSql + bytes.value.length + 1;
              deps.sqliteWasm.getHeapU8()[end - 1] = 0;
              // Each statement is prepared from where the previous one ended, so
              // an error offset is relative to it, also when a step re-prepares
              // the statement after a schema change and fails.
              const toExecError = (statementStart: WasmPtr): SqliteError => {
                const error = toSqliteError(db, "exec");
                return error.sqlOffset == null
                  ? error
                  : {
                      ...error,
                      sqlOffset: statementStart - zSql + error.sqlOffset,
                    };
              };
              for (let start: WasmPtr = zSql; start < end - 1;) {
                const rc = prepareV3(
                  db,
                  start,
                  end - start,
                  0,
                  scratch.out,
                  pzTail,
                );
                if (rc !== SQLITE_OK) return err(toExecError(start));
                const stmt = readPtr(scratch.out) as SqliteStmtPtr;
                const statementStart = start;
                start = readPtr(pzTail) as WasmPtr;
                // NULL for whitespace and comments.
                if (stmt === 0) continue;
                // A parameter exec cannot bind would run as NULL.
                const parameterCount = bindParameterCount(stmt);
                if (parameterCount !== 0) {
                  finalize(stmt);
                  return err({
                    type: "SqliteParameterCountError",
                    expected: parameterCount,
                    actual: 0,
                  });
                }
                let stepRc: SqliteResultCode;
                while ((stepRc = step(stmt)) === SQLITE_ROW);
                const error =
                  stepRc === SQLITE_DONE ? null : toExecError(statementStart);
                finalize(stmt);
                if (error) return err(error);
              }
              return ok();
            }),

          export: () =>
            callOperation(() => {
              // SQLite writes the size before it finalizes its query, which
              // can call a trace callback that runs a query on this
              // database, which reuses the scratch memory.
              const allocatedSize = alloc(8);
              if (!allocatedSize.ok)
                return err(toCodeError("export", SQLITE_NOMEM));
              const pSize = allocatedSize.value;
              using sizeDisposer = new DisposableStack();
              sizeDisposer.defer(() => {
                free(pSize);
              });
              // An error the connection reports after a NULL then comes from this
              // call, which does not report its own failed allocations.
              setErrmsg(db, SQLITE_OK, 0);
              // NULL is the main schema.
              const pages = serialize(db, 0, pSize, 0);
              const size = deps.sqliteWasm
                .getHeapDataView()
                .getBigInt64(pSize, true);
              if (pages === 0) {
                if (errcode(db) !== SQLITE_OK)
                  return err(toSqliteError(db, "export"));
                // NULL with a size of 0 is a database without pages that cannot
                // get one.
                return size === 0n
                  ? ok(new Uint8Array())
                  : err(toCodeError("export", SQLITE_NOMEM));
              }
              const bytes = tryCopy(copyBytes, pages, Number(size));
              free(pages);
              // SQLite zero-fills a page it cannot read and reports success.
              const failure = vfs?.getFailure() ?? null;
              if (failure != null)
                return err({
                  ...toCodeError(
                    "export",
                    isPageAuthenticationError(failure.error)
                      ? SQLITE_CORRUPT
                      : SQLITE_IOERR,
                  ),
                  cause: failure,
                });
              if (bytes == null)
                return err(toCodeError("export", SQLITE_NOMEM));
              return ok(bytes);
            }),

          isAutocommit: () => call(() => getAutocommit(db) !== 0),
        },
        disposer,
      );
      // SQLite forbids closing a connection while it runs, which disposing the
      // database from a callback of one of its operations would do.
      const disposeDatabase = database[Symbol.dispose];
      database[Symbol.dispose] = () => {
        if (runningOperations > 0)
          throw new Error(
            "A SqliteDatabase cannot be disposed while one of its operations runs.",
          );
        disposeDatabase();
      };
      return ok(database);
    });
  };

/**
 * Options for {@link createEncryptedSqliteDatabase}: an EncryptedFile database
 * on a {@link SahPool}, because 2.2.4 wrote only pool files, and the fallback to
 * its key reads the salt with {@link SahPool.read}.
 */
export interface SqliteEncryptedDatabaseOptions extends SqliteEncryptedFileDatabaseOptions {
  readonly vfs: SahPool;
}

/**
 * Opens an EncryptedFile database on a pool, falling back to the key
 * `@evolu/sqlite-wasm` 2.2.4 derived.
 *
 * `@evolu/web` passed 2.2.4 the key as the SQL text `x'<hex>'`, SQLCipher's
 * notation for a raw key, which SQLite3 Multiple Ciphers 2.2.4 treated as a
 * passphrase because of a bug
 * (https://github.com/utelle/SQLite3MultipleCiphers/issues/218, fixed in
 * 2.2.5). So every database it encrypted is keyed with PBKDF2-HMAC-SHA512 of
 * that text, not with the key itself. This Task:
 *
 * 1. Opens with the raw key. A new or empty file always accepts it.
 * 2. Only when a wrong key failed it, so page 1 of the database or a record of its
 *    hot journal failed to authenticate, which the pool records as a
 *    {@link SqlitePageAuthenticationError}, reads the first 16 bytes of the file
 *    through {@link SahPool.read}: the unencrypted cipher salt. Another page of
 *    the database that fails to authenticate is damaged, because page 1 proved
 *    the key, so the open fails with SQLITE_CORRUPT.
 * 3. Derives the legacy key with {@link deriveLegacySqliteKey}, opens again with it
 *    as the raw key, and zeroes it.
 *
 * The result says which key opened the database. When neither key opens it, the
 * error is the raw key's, unless the second open failed otherwise. Rekeying a
 * legacy database to the raw key is a separate decision: it rewrites every
 * page, needs space, and makes the database unreadable to 2.2.4 tabs that share
 * the pool.
 */
export const createEncryptedSqliteDatabase =
  (
    options: SqliteEncryptedDatabaseOptions,
  ): Task<
    SqliteEncryptedDatabase,
    SqliteError | SqliteVfsIoError,
    SqliteWasmDep & SubtleCryptoDep
  > =>
  async (run) => {
    const open = createSqliteDatabase(run.deps);
    const raw = open(options);
    if (raw.ok) return ok({ database: raw.value, keyDerivation: "Raw" });
    if (!isWrongKey(raw.error, options.path)) return err(raw.error);

    const salt = options.vfs.read(
      options.path,
      0 as NonNegativeInt,
      16 as NonNegativeInt,
    );
    if (!salt.ok) {
      assert(
        salt.error.type === "SqliteVfsIoError",
        "The pool has the file the raw key failed to open.",
      );
      return err(salt.error);
    }
    const legacyKey = await run.ok(
      deriveLegacySqliteKey(options.key, salt.value),
    );
    let legacy: Result<SqliteDatabase, SqliteError>;
    try {
      legacy = open({ ...options, key: legacyKey });
    } finally {
      legacyKey.fill(0);
    }
    if (legacy.ok)
      return ok({ database: legacy.value, keyDerivation: "Legacy224" });
    return err(
      isWrongKey(legacy.error, options.path) ? raw.error : legacy.error,
    );
  };

/** The result of {@link createEncryptedSqliteDatabase}. */
export interface SqliteEncryptedDatabase {
  readonly database: SqliteDatabase;
  readonly keyDerivation: SqliteKeyDerivation;
}

/**
 * Which key opened an encrypted database: the raw key, or the key 2.2.4 derived
 * from it because of a bug in SQLite3 Multiple Ciphers, which
 * {@link deriveLegacySqliteKey} describes.
 */
export type SqliteKeyDerivation = "Raw" | "Legacy224";

/**
 * Derives the key `@evolu/sqlite-wasm` 2.2.4 used: PBKDF2-HMAC-SHA512 with
 * 256000 iterations and a 32-byte output, over the UTF-8 text `x'` followed by
 * the key in lowercase hex and `'`, salted with the database's first 16 bytes.
 *
 * It exists because of a bug in SQLite3 Multiple Ciphers 2.2.4, which 2.2.4
 * packaged. `x'<hex>'` is SQLCipher's notation for a raw key, which
 * `@evolu/web` used, but that version took it as a passphrase and derived the
 * key from the text
 * (https://github.com/utelle/SQLite3MultipleCiphers/issues/218, fixed in
 * 2.2.5). So the databases it encrypted are keyed with this derivation, and
 * opening them needs it for as long as they exist, because nothing rekeys
 * them.
 *
 * The text is built byte by byte, so no string holds the key, and zeroed once
 * WebCrypto has imported it.
 */
export const deriveLegacySqliteKey =
  (
    key: EncryptionKey,
    salt: Uint8Array,
  ): Task<EncryptionKey, never, SubtleCryptoDep> =>
  async (run) => {
    const { subtleCrypto } = run.deps;
    // x' followed by the key in lowercase hex and ', where 0x78 is x and 0x27
    // is '.
    const passphrase = new Uint8Array(2 * key.length + 3).fill(0x27);
    passphrase[0] = 0x78;
    for (const [index, byte] of key.entries()) {
      passphrase[2 + 2 * index] = lowercaseHexDigit(byte >> 4);
      passphrase[3 + 2 * index] = lowercaseHexDigit(byte & 0xf);
    }
    let passphraseKey: CryptoKey;
    try {
      passphraseKey = await subtleCrypto.importKey(
        "raw",
        passphrase,
        "PBKDF2",
        false,
        ["deriveBits"],
      );
    } finally {
      passphrase.fill(0);
    }
    const bits = await subtleCrypto.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-512",
        salt: new Uint8Array(salt),
        iterations: 256_000,
      },
      passphraseKey,
      256,
    );
    return ok(new Uint8Array(bits) as EncryptionKey);
  };

/** WebCrypto, which derives legacy keys. */
export interface SubtleCryptoDep {
  readonly subtleCrypto: SubtleCrypto;
}

// A wrong key fails to authenticate page 1 of the database, which is
// SQLITE_NOTADB, or first a hot journal's first record, which is SQLITE_CORRUPT
// for any other page. Without a hot journal, SQLite reads page 1 before any
// other page, and a pool records a record of a journal that fails only until a
// page 1 proved the key, so another page of the database that fails means that
// the key fit and the page is damaged.
const isWrongKey = (error: SqliteError, path: SqliteVfsPath): boolean =>
  error.cause != null &&
  isPageAuthenticationError(error.cause.error) &&
  (error.cause.path !== path || error.cause.error.pageNumber === 1);

const isPageAuthenticationError = (
  error: unknown,
): error is SqlitePageAuthenticationError =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "SqlitePageAuthenticationError";

// The character code of a hex digit in lowercase, as 2.2.4's hex had it.
const lowercaseHexDigit = (nibble: number): number =>
  nibble < 10 ? 0x30 + nibble : 0x61 - 10 + nibble;

const runningStatementMessage =
  "A SqliteStatement cannot run or be disposed while it runs.";

// Copies a value out of wasm memory, or returns null when JavaScript cannot
// allocate the copy, as SQLite returns NULL when it cannot allocate. Engines
// throw different errors then, such as V8's RangeError for an ArrayBuffer and
// Node.js's Error for a string longer than V8's limit. The copy runs no wasm,
// so whatever it throws leaves SQLite as it was, unlike an exception that
// escapes wasm, which breaks the instance.
const tryCopy = <T>(
  copy: (ptr: WasmPtr, byteLength: number) => T,
  ptr: WasmPtr,
  byteLength: number,
): T | null => {
  try {
    return copy(ptr, byteLength);
  } catch {
    return null;
  }
};

// Whether SQLite reads SQL as the string holds it: SQLite reads SQL only up to
// a NUL character, and UTF-8 cannot encode a lone surrogate, which encoding
// would replace with U+FFFD.
const isValidSqlText = (sql: string): boolean =>
  !sql.includes("\0") && sql.isWellFormed();

// How many operations of databases on each VFS are running, so only the
// outermost clears the VFS's failure record. The record is one per VFS, and a
// query a callback runs during an operation is an operation too, on the same
// database or another one on the VFS.
const runningOperationsByVfs = /*#__PURE__*/ new WeakMap<SqliteVfs, number>();

// Whether UTF-8 SQL from start to end holds no statement, only the tokens
// SQLite 3.53.4's tokenizer skips: a semicolon; a space, which starts with a
// space, \t, \n, \f or \r and continues over sqlite3Isspace, which adds \v,
// while a \v that starts a token is illegal; a UTF-8 byte order mark, a space
// of its own; a comment from "--" to a newline or the end; and a comment from
// "/*" that a byte follows, to the first "*/" after the "/*" or the end, so
// "/*/" stays open. An auto-extension can turn comments off with
// SQLITE_DBCONFIG_ENABLE_COMMENTS, which makes SQLite reject them, but a tail
// of only comments is still accepted here, and it runs nothing.
const isEmptySql = (bytes: Uint8Array, start: number, end: number): boolean => {
  let index = start;
  while (index < end) {
    switch (bytes[index]) {
      case semicolon:
        index++;
        break;
      case space:
      case tab:
      case newline:
      case formFeed:
      case carriageReturn:
        index++;
        while (
          index < end &&
          (bytes[index] === space ||
            (bytes[index] >= tab && bytes[index] <= carriageReturn))
        )
          index++;
        break;
      // The first byte of a UTF-8 byte order mark.
      case 0xef:
        if (
          index + 2 >= end ||
          bytes[index + 1] !== 0xbb ||
          bytes[index + 2] !== 0xbf
        )
          return false;
        index += 3;
        break;
      case hyphen:
        if (index + 1 === end || bytes[index + 1] !== hyphen) return false;
        index += 2;
        while (index < end && bytes[index] !== newline) index++;
        break;
      case slash: {
        if (index + 2 >= end || bytes[index + 1] !== asterisk) return false;
        let close = index + 2;
        while (
          close + 1 < end &&
          !(bytes[close] === asterisk && bytes[close + 1] === slash)
        )
          close++;
        index = close + 1 < end ? close + 2 : end;
        break;
      }
      default:
        return false;
    }
  }
  return true;
};

// The ASCII codes isEmptySql reads; \v (11) is between \n and \f.
const tab = 0x09;
const newline = 0x0a;
const formFeed = 0x0c;
const carriageReturn = 0x0d;
const space = 0x20;
const asterisk = 0x2a;
const hyphen = 0x2d;
const slash = 0x2f;
const semicolon = 0x3b;

// The bytes an EncryptedFile database leaves to its VFS at the end of each
// page, where the pool keeps the IV and the HMAC.
const encryptedReservedBytes = 80;

// The largest text or blob bound from the scratch memory, which keeps the
// memory of the largest value it held. A larger value is allocated exactly and
// handed over, which also spares SQLite a copy.
const maxScratchValue = 65_536;

const utf8Encoder = /*#__PURE__*/ new TextEncoder();
