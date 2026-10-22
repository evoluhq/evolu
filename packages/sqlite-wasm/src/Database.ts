/**
 * Evolu's SQLite API: databases and statements over the CApi functions, with
 * typed errors and explicit resource management.
 *
 * Status: {@link createSqliteDatabase} opens Memory databases, and File and
 * EncryptedFile databases on a {@link SahPool}, through Evolu's codec, in C,
 * which encrypts EncryptedFile databases, and
 * {@link createEncryptedSqliteDatabase} also opens the encrypted databases
 * `@evolu/web` 3 created with `@evolu/sqlite-wasm` 2.2.4 in a pool. The codec
 * is tested natively in `@evolu/sqlite-core`, and through the pool in Node.js
 * over a fake OPFS against 2.2.4, which creates databases as `@evolu/web` does,
 * and in Chromium, Firefox and WebKit on real OPFS.
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
 * - The pool records the first failure of its methods, and Evolu's codec the
 *   first of each database, since the last top-level call (open, prepare, run,
 *   iterate, exec, export), and {@link SqliteError.cause} carries the pool's, or
 *   else the codec's. The database clears both records of every database on the
 *   pool before each such call. A call that runs inside another call of a
 *   database on the same pool, as a query a SQL function or trace callback runs
 *   from inside wasm does, is not top-level, so it leaves the records to the
 *   outer call.
 * - Every call, disposal included, enters wasm through {@link SqliteWasm.call}. An
 *   exception or trap that escapes wasm, such as from a call through a disposed
 *   function pointer, is a defect: it is rethrown, and every later call on any
 *   database of the instance throws without entering wasm, because the C stack
 *   and SQLite's state are left inconsistent. The call records a trap before
 *   the operation's deferred frees run, which then free nothing, so the
 *   operation throws the trap itself, and later calls throw an error whose
 *   cause is the trap. No close is attempted after a trap, and an EncryptedFile
 *   open's staged key is zeroed anyway.
 *
 * ## Opening
 *
 * - A Memory database opens `:memory:` on the default VFS with READWRITE, CREATE
 *   and EXRESCODE, and gets Evolu's SQL functions from
 *   `evolu_skiplist_register`.
 * - A File or EncryptedFile database's path is a {@link SqliteVfsPath}, a
 *   canonical path, which SQLite passes to the VFS as it is, never as a URI or
 *   an in-memory database.
 * - A File or EncryptedFile database opens its path with `evolu_codec_open` on
 *   its {@link SahPool}, whose name is Evolu's codec over the pool, without a
 *   key or keyed as the next section describes, and always with
 *   EVOLU_CODEC_PLAINTEXT_CHECKSUMS, the checksums the TypeScript codec of
 *   earlier builds and 2.2.4 wrote, because a journal does not record which
 *   kind it stores. The open is read-write, creates a missing file, uses
 *   extended codes, registers Evolu's SQL functions and reads `sqlite_schema`,
 *   so it rolls back a hot journal, and fails for a file that is not a
 *   database, with SQLITE_NOTADB, or for a hot journal that cannot be rolled
 *   back. Its connection attaches other databases read-only and creates no
 *   file, so a transaction never spans two databases.
 * - A failed open's error takes the connection's message only when the connection
 *   reports the returned code, because `evolu_codec_open` can fail with
 *   SQLITE_MISUSE while the connection's code stays SQLITE_OK. Then the handle
 *   SQLite returned anyway is closed with `sqlite3_close_v2`. Without a handle,
 *   as when memory runs out, the error is the open's result code.
 *
 * ## Encryption
 *
 * - Evolu's codec encrypts an EncryptedFile database and its journal as SQLite3
 *   Multiple Ciphers' `sqlcipher` scheme did with its default parameters, those
 *   of SQLCipher 4, which `PRAGMA cipher = 'sqlcipher'` selected in
 *   `@evolu/web` 3 with 2.2.4. `evolu_codec.h` of `@evolu/sqlite-core`
 *   describes the format and what the codec refuses.
 * - The open stages the raw key in wasm memory for `evolu_codec_open`, and zeroes
 *   it through a fresh heap view before freeing it, also when the open fails.
 *   The codec keeps its own copy, with the keys it derives, in wasm memory
 *   until the database is disposed, and wipes it then. The key never appears in
 *   SQL, a URI or an error, and the caller's key is never modified. After a
 *   trap, no C can run to wipe it, so it stays until the instance ends.
 * - A keyed open reserves 80 bytes at the end of each page of a new database,
 *   where the codec keeps the page's IV and HMAC, and turns `secure_delete` on,
 *   which the codec refuses to turn off. The keying pragmas, such as `PRAGMA
 *   key`, fail with SQLITE_ERROR, and SQLite ignores ATTACH's `KEY` clause.
 * - The read of `sqlite_schema` checks the key. A wrong key fails there with
 *   SQLITE_NOTADB, from page 1, or with SQLITE_CORRUPT when the first record of
 *   a hot journal is another page, and {@link SqliteError.cause} is the codec's
 *   {@link SqlitePageAuthenticationError}. The rollback stops at that record, so
 *   it writes no page of the journal and keeps the journal for the right key.
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
 * - Only page 1 that failed to authenticate, or any page while the database has a
 *   journal, counts as a wrong key. Another page that fails means that page 1
 *   proved the key and the page is damaged, so it fails with SQLITE_CORRUPT and
 *   that page as the cause, also with the key 2.2.4 derived. An I/O error fails
 *   with its own code and the pool's record as its cause, and a database whose
 *   pages authenticate but whose content is malformed fails with SQLite's code
 *   and no cause.
 * - Tabs of earlier builds can share the pool, taking turns as Evolu's leader
 *   lock decides. In DELETE mode, SQLite's default, which Evolu keeps, this
 *   build and 3.53.4-build1 to 3.54.0-build2, whose pool encrypted in
 *   TypeScript, read and extend each other's databases and roll back each
 *   other's hot journals. With a journal SQLite keeps, in PERSIST mode or with
 *   EXCLUSIVE locking and a database recreated at its path, those builds can
 *   take a stale page 1's salt from the journal and keep a half-applied
 *   transaction, so sharing a pool is supported in DELETE mode only. 2.2.4
 *   never rolls back a hot journal, so after a crash here a 2.2.4 tab reads the
 *   half-written rows, and its next write transaction keeps them.
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
 *   3.54.1's tokenizer reads it, not by preparing it, because SQLite applies
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
 * - {@link SqliteStatement.iterate} steps the same way but passes each row to its
 *   callback between steps, outside any wasm frame, and stops when it returns
 *   false. When the callback stops a write with RETURNING early, the reset
 *   commits it, and the iteration returns that commit's error. Operations the
 *   callback runs are top-level when the iteration is, and the iteration clears
 *   the record after the callback returns, so a later step's error carries no
 *   failure of theirs. It resets on every path that leaves the instance working
 *   and rethrows what the callback throws once the call into wasm returns,
 *   which then has not broken the instance. A nested call that broke the
 *   instance ends the iteration with the instance's refusal at once, also when
 *   the callback caught what that call threw.
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
 *   a File or EncryptedFile database fails when the pool or the codec recorded
 *   a failure during it, caused by that record: with SQLITE_CORRUPT for a page
 *   that failed to authenticate, a {@link SqlitePageAuthenticationError}, and
 *   with SQLITE_IOERR otherwise.
 * - Disposing a database finalizes its statements that are still open and then
 *   calls `sqlite3_close_v2`, so no deferred close keeps the VFS's files open.
 *
 * @module
 */

import {
  assert,
  brand,
  constVoid,
  disposable,
  eqUint8Array,
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
  evolu_codec_open,
  evolu_codec_take_failure,
  evolu_skiplist_register,
} from "./EvoluCApi.ts";
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
  SqliteOwnedPtr,
  SqliteStmtPtr,
  WasmPtr,
} from "./Pointer.ts";
import {
  sahPoolMaxDatabasePathSize,
  type SahPool,
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
   * Prepares one statement, iterates it once as {@link SqliteStatement.iterate}
   * does and finalizes it, also when `onRow` throws.
   */
  readonly iterate: (
    sql: string,
    parameters: ReadonlyArray<SqliteValue>,
    onRow: (row: SqliteRow) => boolean,
  ) => Result<void, SqlitePrepareError | SqliteRunError>;

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

  /**
   * Binds the parameters and steps the rows one at a time, passing each to
   * `onRow` until it returns false or the rows end, so no row after the one it
   * stops at is stepped. A query whose plan sorts, groups or aggregates still
   * reads all its input before the first row. Then it resets the statement,
   * also when a step fails or `onRow` throws, which it rethrows. When `onRow`
   * stops a write with RETURNING early, the reset commits it, and iterate
   * returns that commit's error.
   *
   * The callback can run other statements and operations of the same database,
   * but not run, iterate or dispose this statement, which throws.
   */
  readonly iterate: (
    parameters: ReadonlyArray<SqliteValue>,
    onRow: (row: SqliteRow) => boolean,
  ) => Result<void, SqliteRunError>;
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
   * The first failure below SQLite since the top-level operation started, such
   * as the `QuotaExceededError` behind SQLITE_FULL, or a page that failed to
   * authenticate; null when neither the pool nor the codec recorded one. When
   * both did, the pool's, because a failed pool call fails the codec's call
   * without the codec recording anything.
   */
  readonly cause: SqliteFailure | null;
}

/**
 * A failure the pool or Evolu's codec recorded, which {@link SqliteError}
 * carries.
 */
export type SqliteFailure = SqliteVfsFailure | SqliteCodecFailure;

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

/** A failure a pool's method recorded before returning an error code. */
export interface SqliteVfsFailure extends Typed<"SqliteVfsFailure"> {
  readonly method: SqliteVfsMethod;
  /**
   * The path of the file, or null for a method without one or a name that maps
   * to no path.
   */
  readonly path: string | null;
  /**
   * What the browser threw, such as a `DOMException`, or what the pool found
   * wrong, such as a {@link SqliteShortWriteError}, a {@link SahPoolFullError} or
   * a {@link SahPoolInvalidPathError}.
   */
  readonly error: unknown;
}

/**
 * The first failure Evolu's codec recorded for the main database of a File or
 * EncryptedFile connection since the top-level operation started. It has no
 * method or path, because the codec records a failure of the database's journal
 * on the database.
 */
export interface SqliteCodecFailure extends Typed<"SqliteCodecFailure"> {
  readonly error: SqliteCodecError;
}

/** What Evolu's codec found wrong. */
export type SqliteCodecError =
  | SqlitePageAuthenticationError
  | SqliteEncryptionUnsupportedError
  | SqliteRandomSourceError;

/**
 * What Evolu's codec refuses because it cannot keep a database encrypted, or
 * because a database keyed through SQL would stay plaintext. For an encrypted
 * database, a read or write that is not a whole page, a page 1 that would
 * change the page size or the reserved bytes, as a VACUUM that changes the page
 * size writes it, turning `secure_delete` off, or the hot journal of one opened
 * without its key, which fails with SQLITE_CANTOPEN and stays for the key. For
 * any database on a pool, the keying pragmas, such as `PRAGMA key`, and a page
 * 1 that says WAL.
 */
export interface SqliteEncryptionUnsupportedError extends Typed<"SqliteEncryptionUnsupported"> {}

/**
 * The random source failed while Evolu's codec encrypted a page, so the write
 * failed with SQLITE_IOERR_WRITE. What the source threw went to the instance's
 * `ReportDefect`.
 */
export interface SqliteRandomSourceError extends Typed<"SqliteRandomSourceError"> {}

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
  | "xCheckReservedLock";

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

/** An unencrypted database file on a {@link SahPool}. */
export interface SqliteFileDatabaseOptions extends Typed<"File"> {
  readonly vfs: SahPool;
  /**
   * The canonical path of the file in the pool, such as `/evolu1.db`, by which
   * the pool also lists and deletes it.
   */
  readonly path: SqliteVfsPath;
}

/**
 * A database file on a {@link SahPool} that Evolu's codec encrypts, in the
 * format of SQLite3 Multiple Ciphers' `sqlcipher` scheme.
 *
 * Only the database file and its journal are encrypted. The connection attaches
 * other databases read-only and creates no file, because SQLite ignores the
 * `KEY` clause of `ATTACH`, and `VACUUM INTO` writes a plaintext file, where
 * 2.2.4 encrypted both with the database's key or the `KEY` of `ATTACH`.
 */
export interface SqliteEncryptedFileDatabaseOptions extends Typed<"EncryptedFile"> {
  readonly vfs: SahPool;
  /**
   * The path of the file in the pool, as {@link SqliteFileDatabaseOptions.path}
   * describes.
   */
  readonly path: SqliteVfsPath;
  /**
   * The raw key, which the open stages in wasm memory for the codec, which
   * keeps its own copy until the database is disposed.
   */
  readonly key: EncryptionKey;
}

/** Error returned when a string is not a valid {@link SqliteVfsPath}. */
export interface SqliteVfsPathError extends TypeError<"SqliteVfsPath"> {
  readonly value: string;
}

/**
 * The canonical path of a database file on a {@link SahPool}, such as
 * `/evolu1.db`, one spelling per file, as {@link SahPool.getPaths} lists it.
 *
 * A path is canonical when it is its own `new URL(path,
 * "file://localhost/").pathname`, the path a pool maps a name to, so the pool
 * opens, lists and deletes the file by the path the database opened it with. A
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
 *   strips and whose escapes it decodes, so the pool would get another name,
 *   and whose `vfs` parameter could name another VFS.
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
 * The storage of a pool failed outside SQLite, as when {@link SahPool.unlink}
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
 * A page of an encrypted database or its journal that failed to authenticate,
 * because the key is wrong or the page was altered or cut short, as Evolu's
 * codec records it.
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
 * first record is not page 1. An encrypted database opened without its key
 * while it has a hot journal that records pages fails with SQLITE_CANTOPEN,
 * caused by the codec's {@link SqliteEncryptionUnsupportedError}, and the
 * journal stays for the key. A leftover journal that is not hot, such as one
 * `journal_mode = PERSIST` or TRUNCATE keeps, gives SQLITE_NOTADB, as no
 * journal does. For encrypted databases that 2.2.4 may have keyed, use
 * {@link createEncryptedSqliteDatabase}.
 */
export const createSqliteDatabase =
  (deps: SqliteWasmDep) =>
  (options: SqliteDatabaseOptions): Result<SqliteDatabase, SqliteError> => {
    const { call } = deps.sqliteWasm;
    const vfs = options.type === "Memory" ? null : options.vfs;

    // The operations of this database that are running, as one that a
    // callback of another runs, so the database is not disposed under them.
    let runningOperations = 0;

    // Clears the pool's failure record and the codec's records of the pool's
    // databases, and then calls an operation through call, so the cause of a
    // SqliteError is a failure of this operation. A pool that throws, as a
    // disposed one does, then throws before wasm is entered, without breaking
    // the instance, and the drain of the codec's records, which enters C, runs
    // inside the operation's call. An operation inside another on the same
    // pool, as a query a SQL function or trace callback runs from inside wasm,
    // keeps the records, which the outer operation still reads.
    const callOperation = <T>(fn: () => T): T => {
      runningOperations++;
      try {
        if (vfs == null) return call(fn);
        const running = runningOperationsByVfs.get(vfs) ?? 0;
        if (running === 0) vfs.clearFailure();
        runningOperationsByVfs.set(vfs, running + 1);
        try {
          return call(() => {
            if (running === 0) drainCodecFailures(vfs);
            return fn();
          });
        } finally {
          runningOperationsByVfs.set(vfs, running);
        }
      } finally {
        runningOperations--;
      }
    };

    using disposer = new DisposableStack();
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
      const codecOpen = evolu_codec_open(deps);
      const takeFailure = evolu_codec_take_failure(deps);
      const skiplistRegister = evolu_skiplist_register(deps);
      const alloc = allocWasm(deps);
      const allocString = allocCString(deps);
      const copyBytes = copyWasmBytes(deps);
      const readString = readCString(deps);
      const readText = readUtf8(deps);
      const writeBytes = writeWasmBytes(deps);
      const writeText = writeUtf8(deps);

      const statements = new Set<SqliteStatement>();

      // After a trap, which breaks the instance, C's state is inconsistent, so
      // a deferred free frees nothing, and the trap reaches the caller as it
      // is.
      const freeUnlessBroken = (pointer: Parameters<typeof free>[0]): void => {
        if (!deps.sqliteWasm.isBroken()) call(() => free(pointer));
      };

      // Frees pointer after fn, whose call records a trap before the free.
      const callAndFree = <T>(pointer: SqliteOwnedPtr, fn: () => T): T => {
        using cleanup = new DisposableStack();
        cleanup.defer(() => {
          freeUnlessBroken(pointer);
        });
        return call(fn);
      };

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
          cause: toCause(db),
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

      const createdScratch = createSqliteScratch(deps);
      if (!createdScratch.ok) return err(toCodeError("open", SQLITE_NOMEM));
      const scratch = createdScratch.value;
      disposer.defer(() => {
        scratch[Symbol.dispose]();
      });
      const pzTail = (scratch.out + 4) as WasmPtr;

      // The codec's first failure since the pool's top-level operation
      // started, copied from C, where closing the connection frees it.
      let codecFailure: SqliteCodecError | null = null;

      // Moves the codec's record of the database out of C.
      const takeCodecFailure = (db: SqliteDbPtr): SqliteCodecError | null => {
        // Beside the output parameters, which a drain another database starts
        // during a call of this one leaves as they are.
        const pFailure = (scratch.out + 8) as WasmPtr;
        // SQLITE_NOTFOUND, for a connection without a codec file, has none.
        if (takeFailure(db, pFailure) !== SQLITE_OK) return null;
        const view = deps.sqliteWasm.getHeapDataView();
        // By the value of C's evolu_codec_failure_type, 0 for none.
        const type = view.getInt32(pFailure, true);
        return type === 1
          ? {
              type: "SqlitePageAuthenticationError",
              pageNumber: view.getUint32(pFailure + 4, true),
            }
          : type === 2
            ? { type: "SqliteEncryptionUnsupported" }
            : type === 3
              ? { type: "SqliteRandomSourceError" }
              : null;
      };

      // The pool's failure, or else the codec's, which each take copies into
      // the database's slot, where the first stays.
      const toCause = (db: SqliteDbPtr): SqliteFailure | null => {
        if (vfs == null) return null;
        const taken = takeCodecFailure(db);
        codecFailure ??= taken;
        return (
          vfs.getFailure() ??
          (codecFailure == null
            ? null
            : { type: "SqliteCodecFailure", error: codecFailure })
        );
      };

      // A File or EncryptedFile database's path is followed by the name of its
      // VFS.
      const filename = allocString(
        options.type === "Memory"
          ? ":memory:"
          : `${options.path}\0${options.vfs.vfsName}`,
      );
      if (!filename.ok) return err(toCodeError("open", SQLITE_NOMEM));
      const zFilename = filename.value;
      let rc: SqliteResultCode;
      {
        using openDisposer = new DisposableStack();
        if (options.type === "Memory") {
          rc = callAndFree(zFilename, () =>
            sqlite3_open_v2(deps)(
              zFilename,
              scratch.out,
              SQLITE_OPEN_READWRITE |
                SQLITE_OPEN_CREATE |
                SQLITE_OPEN_EXRESCODE,
              0,
            ),
          );
        } else {
          // evolu_codec_open rolls back a hot journal and reads the schema in
          // a call of its own, so a trap there breaks the instance before it
          // unwinds to the frees, which then free nothing on the state the
          // trap left.
          openDisposer.defer(() => {
            freeUnlessBroken(zFilename);
          });
          let zKey: WasmPtr | 0 = 0;
          if (options.type === "EncryptedFile") {
            const { key } = options;
            const staged = call(() => alloc(key.length));
            if (!staged.ok) return err(toCodeError("open", SQLITE_NOMEM));
            const pKey = staged.value;
            openDisposer.defer(() => {
              freeUnlessBroken(pKey);
            });
            // Zeroed before its free, also when a trap skips that, through a
            // fresh view, because memory can grow during the open.
            openDisposer.defer(() => {
              deps.sqliteWasm.getHeapU8().fill(0, pKey, pKey + key.length);
            });
            deps.sqliteWasm.getHeapU8().set(key, pKey);
            zKey = pKey;
          }
          const zVfs = (deps.sqliteWasm.getHeapU8().indexOf(0, zFilename) +
            1) as CStringPtr;
          rc = call(() =>
            codecOpen(zFilename, scratch.out, zVfs, zKey, plaintextChecksums),
          );
        }
      }
      const db = readPtr(scratch.out) as SqliteDbPtr;
      // evolu_codec_open registers them on a File or EncryptedFile connection.
      if (rc === SQLITE_OK && options.type === "Memory")
        rc = skiplistRegister(db);
      if (rc !== SQLITE_OK) {
        // The connection's message only when it reports the returned code,
        // because evolu_codec_open can fail with SQLITE_MISUSE while the
        // connection's code stays SQLITE_OK. The cause is taken before the
        // close, which frees the codec's record.
        const error =
          db !== 0 && extendedErrcode(db) === rc
            ? toSqliteError(db, "open")
            : {
                ...toCodeError("open", rc),
                cause: db === 0 ? null : toCause(db),
              };
        call(() => closeV2(db));
        return err(error);
      }
      disposer.defer(() => {
        call(() => closeV2(db));
      });
      if (vfs != null) {
        const slots = failureSlotsByVfs.get(vfs) ?? new Set<CodecFailureSlot>();
        failureSlotsByVfs.set(vfs, slots);
        const slot: CodecFailureSlot = {
          drain: () => {
            codecFailure = null;
            takeCodecFailure(db);
          },
        };
        slots.add(slot);
        // Before the close, so no drain takes from a closed connection.
        disposer.defer(() => {
          slots.delete(slot);
        });
      }
      // Finalized before the close, so no deferred close keeps files open.
      disposer.defer(() => {
        for (const statement of statements) statement[Symbol.dispose]();
      });

      const prepareStatement = (
        sql: string,
        prepFlags: number,
      ): Result<SqliteStmtPtr, SqlitePrepareError> => {
        if (!isValidSqlText(sql)) return err({ type: "SqliteInvalidSqlText" });
        // SQLite parses the SQL in place, while a callback can run a query on
        // this database, which reuses the scratch memory. Three bytes per
        // UTF-16 code unit hold any UTF-8, and encoding into them is faster
        // than allocCString's exact copy, which encodes into a temporary array
        // first. A run prepares SQL every time, so it is a hot path.
        const capacity = sql.length * 3;
        const allocated = alloc(capacity + 1);
        if (!allocated.ok) return err(toCodeError("prepare", SQLITE_NOMEM));
        const zSql = allocated.value;
        return callAndFree(zSql, () => {
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
          if (rc !== SQLITE_OK) return err(toSqliteError(db, "prepare"));
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
        });
      };

      const createRunner = (stmt: SqliteStmtPtr) => {
        const parameterCount = bindParameterCount(stmt);
        let names: ReadonlyArray<string> | null = null;
        let namesReprepares = 0;

        // Binds the parameters, returning whether the bindings must be cleared
        // after the run.
        const bind = (
          parameters: ReadonlyArray<SqliteValue>,
        ): Result<boolean, SqliteRunError> => {
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
          return ok(clearsBindings);
        };

        // Steps the bound statement, passing each row to onRow until it
        // returns false, and returns the error that ended the steps, if any.
        const stepRows = (
          onRow: (row: SqliteRow) => boolean,
        ): SqliteError | null => {
          let rowCount = 0;
          let rc: SqliteResultCode;
          // A read that fails because SQLite is out of memory leaves the loop
          // with SQLITE_ROW.
          steps: while ((rc = step(stmt)) === SQLITE_ROW) {
            // A schema change re-prepares the statement, and SELECT * can then
            // return other columns, so the first row checks the counter.
            const reprepares =
              rowCount === 0
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
            rowCount++;
            if (!onRow(row)) return null;
          }
          return rc === SQLITE_DONE
            ? null
            : rc === SQLITE_ROW
              ? toCodeError("step", SQLITE_NOMEM)
              : toSqliteError(db, "step");
        };

        // After SQLITE_DONE it returns SQLITE_OK, and after a failed step it
        // returns that step's error again. After a row, as when an iteration
        // stops early, it completes the statement, whose commit can then fail,
        // and that error is returned.
        const resetStatement = (
          clearsBindings: boolean,
        ): SqliteError | null => {
          const error =
            reset(stmt) === SQLITE_OK ? null : toSqliteError(db, "step");
          if (clearsBindings) clearBindings(stmt);
          return error;
        };

        const run = (
          parameters: ReadonlyArray<SqliteValue>,
        ): Result<SqliteRunResult, SqliteRunError> => {
          const bound = bind(parameters);
          if (!bound.ok) return bound;
          const totalChanges = totalChanges64(db);
          const rows: Array<SqliteRow> = [];
          const error = stepRows((row) => {
            rows.push(row);
            return true;
          });
          resetStatement(bound.value);
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

        // onRow runs between steps, outside any wasm frame, so what it throws
        // does not break the instance. It ends the steps, the statement is
        // reset, and the throw reaches the caller after the call into wasm
        // returns. A nested call that broke the instance ends the iteration
        // with the instance's refusal at once, also when onRow caught what that
        // call threw, so SQLite never resumes on that state.
        const iterate = (
          parameters: ReadonlyArray<SqliteValue>,
          onRow: (row: SqliteRow) => boolean,
        ): IterateResult<SqliteRunError> => {
          const bound = bind(parameters);
          if (!bound.ok) return { type: "Settled", result: err(bound.error) };
          let thrown = null as { readonly error: unknown } | null;
          const error = stepRows((row) => {
            try {
              let continues: boolean;
              if (vfs == null) continues = onRow(row);
              else {
                // onRow runs outside any wasm frame, so the operations it runs
                // are top-level when the iteration is and clear the VFS's
                // failure record themselves. Then a top-level iteration clears
                // it again, so its later failure carries none of theirs.
                const running = runningOperationsByVfs.get(vfs) as number;
                runningOperationsByVfs.set(vfs, running - 1);
                try {
                  continues = onRow(row);
                  if (running === 1) {
                    vfs.clearFailure();
                    // In a call of its own, which refuses an instance onRow
                    // broke after the iteration's call checked, and breaks it
                    // on a trap before the statement resets.
                    call(() => {
                      drainCodecFailures(vfs);
                    });
                  }
                } finally {
                  runningOperationsByVfs.set(vfs, running);
                }
              }
              if (deps.sqliteWasm.isBroken()) deps.sqliteWasm.call(constVoid);
              return continues;
            } catch (error) {
              if (deps.sqliteWasm.isBroken()) throw error;
              thrown = { error };
              return false;
            }
          });
          const resetError = resetStatement(bound.value);
          if (thrown) return { type: "Thrown", error: thrown.error };
          const failure = error ?? resetError;
          return { type: "Settled", result: failure ? err(failure) : ok() };
        };

        return { parameterCount, run, iterate };
      };

      // Rethrows what onRow threw, once the call into wasm has returned.
      const rethrowOnRowError = <E>(
        iterated: IterateResult<E>,
      ): Result<void, E> => {
        if (iterated.type === "Thrown") throw iterated.error;
        return iterated.result;
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
                  iterate: (parameters, onRow) => {
                    if (running) throw new Error(runningStatementMessage);
                    running = true;
                    try {
                      return rethrowOnRowError(
                        callOperation(() => runner.iterate(parameters, onRow)),
                      );
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

          iterate: (sql, parameters, onRow) => {
            const iterated = callOperation(
              (): IterateResult<SqlitePrepareError | SqliteRunError> => {
                const prepared = prepareStatement(sql, 0);
                if (!prepared.ok)
                  return { type: "Settled", result: err(prepared.error) };
                const iterated = createRunner(prepared.value).iterate(
                  parameters,
                  onRow,
                );
                finalize(prepared.value);
                return iterated;
              },
            );
            return rethrowOnRowError(iterated);
          },

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
              return callAndFree(zSql, () => {
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
              });
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
              return callAndFree(pSize, () => {
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
                const failure = toCause(db);
                if (failure != null)
                  return err({
                    ...toCodeError(
                      "export",
                      failure.type === "SqliteCodecFailure" &&
                        failure.error.type === "SqlitePageAuthenticationError"
                        ? SQLITE_CORRUPT
                        : SQLITE_IOERR,
                    ),
                    cause: failure,
                  });
                if (bytes == null)
                  return err(toCodeError("export", SQLITE_NOMEM));
                return ok(bytes);
              });
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
 * 2. Only when a wrong key failed it, so page 1, or any page while the database
 *    has a journal, failed to authenticate, which the codec records as a
 *    {@link SqlitePageAuthenticationError}, reads the salts through
 *    {@link SahPool.read}: the file's first 16 bytes, the unencrypted cipher
 *    salt, and, when they differ, the first 16 bytes of the first page-1 record
 *    the rollback of its hot journal reaches, which stores the salt
 *    unencrypted, for a database whose first bytes a crash tore. Another page
 *    that fails to authenticate is damaged, because page 1 proved the key, so
 *    the open fails with SQLITE_CORRUPT. A database shorter than 16 bytes has
 *    no salt, and the raw key's error is returned.
 * 3. For each salt, derives the legacy key with {@link deriveLegacySqliteKey},
 *    opens again with it as the raw key, and zeroes it, until an open does not
 *    fail with a wrong key.
 *
 * The result says which key opened the database. When no key opens it, the
 * error is the raw key's, unless a later open failed otherwise. Rekeying a
 * legacy database to the raw key is a separate decision: it rewrites every
 * page, needs space, and makes the database unreadable to 2.2.4 tabs that share
 * the pool. Tabs of earlier builds can share the pool in DELETE journal mode
 * only, as this module's documentation describes.
 */
export const createEncryptedSqliteDatabase =
  (
    options: SqliteEncryptedFileDatabaseOptions,
  ): Task<
    SqliteEncryptedDatabase,
    SqliteError | SqliteVfsIoError,
    SqliteWasmDep & SubtleCryptoDep
  > =>
  async (run) => {
    const { vfs, path } = options;
    const open = createSqliteDatabase(run.deps);
    const raw = open(options);
    if (raw.ok) return ok({ database: raw.value, keyDerivation: "Raw" });
    if (!isWrongKey(raw.error, options)) return err(raw.error);

    // A database shorter than 16 bytes has no salt, and a junk key would key
    // its emptied file, so a later start could not open what it wrote.
    const databaseSalt = vfs.read(path, 0 as NonNegativeInt, saltSize);
    if (!databaseSalt.ok) {
      assert(
        databaseSalt.error.type === "SqliteVfsIoError",
        "The pool has the file the raw key failed to open.",
      );
      return err(databaseSalt.error);
    }
    if (databaseSalt.value.length < saltSize) return err(raw.error);
    const salts = [databaseSalt.value];

    // The bytes of the journal, or null for fewer than asked, at the end of the
    // file, or for a journal the pool no longer has.
    const readJournal = (
      offset: number,
      byteLength: number,
    ): Result<Uint8Array<ArrayBuffer> | null, SqliteVfsIoError> => {
      const read = vfs.read(
        `${path}-journal`,
        offset as NonNegativeInt,
        byteLength as NonNegativeInt,
      );
      if (!read.ok)
        return read.error.type === "SahPoolFileNotFound"
          ? ok(null)
          : err(read.error);
      return ok(read.value.length === byteLength ? read.value : null);
    };
    const toView = (bytes: Uint8Array<ArrayBuffer>) =>
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Adds the first 16 bytes of the first page-1 record a hot journal's
    // rollback reaches, when they differ from the database's, walking the
    // records as SQLite's pager_playback does, without checking their checksums
    // or authenticating them, since the C open verifies the salt it picks.
    // Nothing without a hot journal, which starts with SQLite's magic and
    // records an original size other than 0, or without such a record. The
    // walk ends at a header the file does not hold whole or whose magic
    // differs, at a record numbered 0 or with the lock-byte page, and at a
    // record the file does not hold whole; a first header with an invalid
    // sector or page size has no records. A segment's count of 0 has no
    // records, and 0xFFFFFFFF counts the records up to the end of the file.
    walk: {
      const first = readJournal(0, 28);
      if (!first.ok) return first;
      if (first.value == null) break walk;
      const header = toView(first.value);
      const sectorSize = header.getUint32(20);
      const pageSize = header.getUint32(24);
      if (
        header.getUint32(16) === 0 ||
        !isPowerOfTwoIn(sectorSize, 32, 65536) ||
        !isPowerOfTwoIn(pageSize, 512, 65536)
      )
        break walk;
      const lockPage = Math.floor(0x4000_0000 / pageSize) + 1;
      const recordSize = pageSize + 8;

      let at = 0;
      let recordsLeft = 0;
      for (;;) {
        while (recordsLeft === 0) {
          at = Math.ceil(at / sectorSize) * sectorSize;
          const segment = readJournal(at, sectorSize);
          if (!segment.ok) return segment;
          if (
            segment.value == null ||
            !eqUint8Array(segment.value.subarray(0, 8), journalMagic)
          )
            break walk;
          at += sectorSize;
          const records = toView(segment.value).getUint32(8);
          // Up to the end of the file, where a record it does not hold whole
          // ends the walk.
          recordsLeft = records === 0xffff_ffff ? Infinity : records;
        }
        const record = readJournal(at, recordSize);
        if (!record.ok) return record;
        if (record.value == null) break walk;
        const pageNumber = toView(record.value).getUint32(0);
        at += recordSize;
        recordsLeft--;
        if (pageNumber === 0 || pageNumber === lockPage) break walk;
        if (pageNumber === 1) {
          const journalSalt = record.value.slice(4, 4 + saltSize);
          if (!eqUint8Array(journalSalt, databaseSalt.value))
            salts.push(journalSalt);
          break walk;
        }
      }
    }

    for (const salt of salts) {
      const legacyKey = await run.ok(deriveLegacySqliteKey(options.key, salt));
      let legacy: Result<SqliteDatabase, SqliteError>;
      try {
        legacy = open({ ...options, key: legacyKey });
      } finally {
        legacyKey.fill(0);
      }
      if (legacy.ok)
        return ok({ database: legacy.value, keyDerivation: "Legacy224" });
      if (!isWrongKey(legacy.error, options)) return err(legacy.error);
    }
    return err(raw.error);
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

// A wrong key fails to authenticate page 1 of the database, or first a hot
// journal's first record, which can be any page. The codec records a journal
// record's failure on the database, so any page counts while the pool still
// has the database's journal after the failed open: a wrong key never removes
// a journal that playback could restore from. Without one, SQLite reads page 1
// before any other page, so another page that fails means that the key fit
// and the page is damaged.
const isWrongKey = (
  error: SqliteError,
  { vfs, path }: SqliteEncryptedFileDatabaseOptions,
): boolean =>
  error.cause?.type === "SqliteCodecFailure" &&
  error.cause.error.type === "SqlitePageAuthenticationError" &&
  (error.cause.error.pageNumber === 1 ||
    vfs.getPaths().includes(`${path}-journal`));

// Whether a number is a power of two from min to max.
const isPowerOfTwoIn = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max && (value & (value - 1)) === 0;

// The character code of a hex digit in lowercase, as 2.2.4's hex had it.
const lowercaseHexDigit = (nibble: number): number =>
  nibble < 10 ? 0x30 + nibble : 0x61 - 10 + nibble;

/**
 * What an iteration's call into wasm returns: its result, or what onRow threw,
 * which is rethrown once the call has returned.
 */
type IterateResult<E> = IterateSettled<E> | IterateThrown;

interface IterateSettled<E> extends Typed<"Settled"> {
  readonly result: Result<void, E>;
}

interface IterateThrown extends Typed<"Thrown"> {
  readonly error: unknown;
}

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
// query a callback runs from inside wasm during an operation is an operation
// too, on the same database or another one on the VFS. An iteration lowers the
// count while its onRow runs, outside wasm.
const runningOperationsByVfs = /*#__PURE__*/ new WeakMap<SahPool, number>();

/** A database's slot for the codec's failure. */
interface CodecFailureSlot {
  /** Empties the slot and discards the codec's record of the database. */
  readonly drain: () => void;
}

// The slots of the databases open on each pool, which join after a successful
// open and leave before the close.
const failureSlotsByVfs = /*#__PURE__*/ new WeakMap<
  SahPool,
  Set<CodecFailureSlot>
>();

// Empties the slot of every database on the pool and discards the codec's
// records, which a failure SQLite reported as success, as an export's
// zero-filled page, may have left. Called inside a call, since it enters C.
const drainCodecFailures = (vfs: SahPool): void => {
  for (const slot of failureSlotsByVfs.get(vfs) ?? []) slot.drain();
};

// Whether UTF-8 SQL from start to end holds no statement, only the tokens
// SQLite 3.54.1's tokenizer skips: a semicolon; a space, which starts with a
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

// EVOLU_CODEC_PLAINTEXT_CHECKSUMS, which every open on a pool passes, because
// the TypeScript codec of earlier builds and 2.2.4 wrote plaintext checksums,
// and a journal does not record which kind it stores, so an open with the
// other kind would take the first record for the journal's end.
const plaintextChecksums = 2;

// An encrypted database's cipher salt, its first 16 bytes.
const saltSize = 16 as NonNegativeInt;

// What starts every header of a rollback journal.
const journalMagic = /*#__PURE__*/ Uint8Array.of(
  0xd9,
  0xd5,
  0x05,
  0xf9,
  0x20,
  0xa1,
  0x63,
  0xd7,
);

// The largest text or blob bound from the scratch memory, which keeps the
// memory of the largest value it held. A larger value is allocated exactly and
// handed over, which also spares SQLite a copy.
const maxScratchValue = 65_536;

const utf8Encoder = /*#__PURE__*/ new TextEncoder();
