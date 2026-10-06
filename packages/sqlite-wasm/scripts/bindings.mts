/**
 * The metadata of each C function `scripts/generate.mts` binds: its
 * documentation, parameter names, and refinements of the types SQLite's
 * signature table gives.
 *
 * Every public C function the pinned binary exports needs an entry in
 * {@link bindings}, and an entry for any other function fails generation; the
 * generator's module documentation says which exports are public. The variadic
 * C functions, which the binary does not export, are in
 * {@link variadicBindings}.
 *
 * Parameter names come from sqlite3.h where it names them. Where it leaves a
 * parameter unnamed, the name is the one the header gives the same kind of
 * parameter elsewhere, such as `pStmt` for a statement, `db` for a connection
 * and `iCol` for a column index, or else a descriptive name from the
 * documentation's wording.
 *
 * A parameter accepts NULL where the documentation says what NULL means, or
 * where SQLite only passes the pointer back, such as a callback's context. A
 * behavior only SQLite's implementation shows is documented where it helps but
 * not relied on.
 *
 * @module
 */

/** The metadata of one C function. */
export interface Binding {
  /** The JSDoc paragraph of the generated function. */
  readonly doc: string;

  /** SQLite's documentation. */
  readonly url: string;

  /**
   * Parameter names in C order, one per argument of the signature.
   *
   * `name: Type` replaces the TypeScript type the table type maps to, for
   * example with a branded pointer or a union that accepts NULL. `Type` is one
   * narrowing type or a `|` union of them, each of the wasm value type the
   * table type has.
   */
  readonly params: ReadonlyArray<string>;

  /**
   * Replaces the TypeScript result type the table type maps to, with the same
   * syntax as a parameter's `Type`.
   */
  readonly result?: string;

  /**
   * Call signatures TypeScript tries before the one {@link Binding.params} and
   * {@link Binding.result} give, for a function whose result type depends on an
   * argument's value. They use the same syntax, and a parameter `Type` may also
   * be a non-negative integer literal of a wasm `i` value.
   */
  readonly overloads?: ReadonlyArray<{
    readonly params: ReadonlyArray<string>;
    readonly result: string;
  }>;

  /**
   * Replaces the table's result type, in the table's syntax, when the table is
   * wrong, as the pinned wasm type shows.
   */
  readonly correctedResult?: {
    readonly type: string;
    readonly reason: string;
  };

  /**
   * The signature, in the table's syntax, of a function the table omits: the
   * result type, then one type per argument.
   */
  readonly supplement?: {
    readonly signature: readonly [result: string, ...args: Array<string>];
    readonly reason: string;
  };
}

/**
 * The metadata of a variadic C function.
 *
 * The binary exports no variadic function. The build's `sqlite3__wasm_*` shims
 * call it with fixed arguments, one shim per argument list, and the generated
 * function passes each option to the shim for its arguments.
 */
export interface VariadicBinding {
  /**
   * The JSDoc of the generated function. A blank line separates paragraphs, and
   * lines starting with `- ` form a list.
   */
  readonly doc: string;

  /** SQLite documentation. */
  readonly url: string;

  /**
   * Names of the parameters before the option, as {@link Binding.params} gives
   * them.
   */
  readonly params: ReadonlyArray<string>;

  /** The argument lists, in the order the generated function checks them. */
  readonly variants: readonly [VariadicVariant, ...Array<VariadicVariant>];

  /**
   * The prefix of this function's option constants, such as `SQLITE_DBCONFIG_`.
   * Every pinned constant with it must be in a variant's ops or in
   * {@link VariadicBinding.unsupportedOps}, so a build that adds an option fails
   * generation until the metadata dispatches or rejects it.
   */
  readonly opPrefix: string;

  /**
   * The constants with {@link VariadicBinding.opPrefix} that no variant takes:
   * options SQLite's JavaScript does not dispatch either, and constants that
   * are not options, such as SQLITE_DBCONFIG_MAX.
   */
  readonly unsupportedOps: ReadonlyArray<string>;

  /**
   * The result code constant returned without calling wasm for an option no
   * variant lists, as SQLite's JavaScript does. Omitted for a single variant
   * whose shim returns an error for any other option itself; the generated
   * function is then that shim.
   */
  readonly otherOps?: string;
}

/** One argument list of a {@link VariadicBinding}. */
export interface VariadicVariant {
  /** The `sqlite3__wasm_*` shim that passes these arguments. */
  readonly shim: string;

  /** The JSDoc paragraph of the shim in `SqliteCExports`. */
  readonly shimDoc: string;

  /**
   * The shim's signature in the table's syntax, which the table omits: the
   * result type, then one type per argument, the option's `int` included.
   */
  readonly signature: readonly [result: string, ...args: Array<string>];

  /**
   * Names of the arguments after the option, as {@link Binding.params} gives
   * them. A final `name?: Type` or `name?` is optional and passed as 0 when
   * omitted.
   */
  readonly args: ReadonlyArray<string>;

  /** The SQLITE_* constants of the options that take these arguments. */
  readonly ops: readonly [string, ...Array<string>];

  /** The exported union type of the options, required for more than one. */
  readonly opType?: { readonly name: string; readonly doc: string };
}

const c3ref = (page: string): string => `https://sqlite.org/c3ref/${page}.html`;

const intResultCorrection = {
  type: "int",
  reason:
    "SQLite's table declares no result, but the C function returns a result code, as the wasm type shows.",
} as const;

const callbacksReason =
  "SQLite binds it by hand to accept JavaScript functions as callbacks.";

const autoExtensionReason =
  "SQLite binds the auto-extension functions by hand to manage the JavaScript functions it converts.";

const proxyTextReason =
  "SQLite's build replaces it with a JavaScript proxy that keeps embedded NUL characters (proxy-text-apis).";

// oxlint-disable evolu/require-pure-annotation -- Build-script data, never bundled.
/** The metadata of every public C function, in output order. */
export const bindings: Readonly<Record<string, Binding>> = {
  // Library.
  sqlite3_initialize: {
    doc: "Initializes the library, returning SQLITE_OK or an error code. Once the library is initialized, further calls are harmless no-ops until sqlite3_shutdown.",
    url: c3ref("initialize"),
    params: [],
    result: "SqliteResultCode",
    correctedResult: intResultCorrection,
  },
  sqlite3_shutdown: {
    doc: "Deallocates the resources sqlite3_initialize allocated. Every connection must be closed and every other SQLite resource freed first; only the first call after an initialization has an effect. Then initialize the library again with initializeSqliteWasm. sqlite3_initialize alone, or any call that initializes the library itself, such as an open, makes the unix VFS the default again, from which the generator of sqlite3_randomness, when reset or unused since loading, seeds itself with the time and a constant pid instead of RandomBytes, and registers kvvfs again, which traps when :localStorage: is opened.",
    url: c3ref("initialize"),
    params: [],
    result: "SqliteResultCode",
    correctedResult: intResultCorrection,
  },
  sqlite3_libversion: {
    doc: "Returns the library's version string, the SQLITE_VERSION it was built with, in static memory.",
    url: c3ref("libversion"),
    params: [],
  },
  sqlite3_libversion_number: {
    doc: "Returns the SQLITE_VERSION_NUMBER the library was built with.",
    url: c3ref("libversion"),
    params: [],
  },
  sqlite3_sourceid: {
    doc: "Returns the date, time and check-in hash of the SQLite source the library was built from, as a static string.",
    url: c3ref("libversion"),
    params: [],
  },
  sqlite3_compileoption_get: {
    doc: "Returns the N-th option defined at compile time, without its SQLITE_ prefix, or NULL when N is out of range. The string is static.",
    url: c3ref("compileoption_get"),
    params: ["N"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_compileoption_used: {
    doc: "Returns 1 if the named option, with or without its SQLITE_ prefix, was defined at compile time, and 0 otherwise.",
    url: c3ref("compileoption_get"),
    params: ["zOptName"],
  },
  sqlite3_status: {
    doc: "Reads a global SQLITE_STATUS_* counter into `*pCurrent` and its highwater mark into `*pHighwater`, resetting the mark when resetFlag is non-zero. A counter that tracks only one of the two leaves the other unwritten, and values beyond 32 bits are undefined.",
    url: c3ref("status"),
    params: ["op", "pCurrent", "pHighwater", "resetFlag"],
    result: "SqliteResultCode",
  },
  sqlite3_status64: {
    doc: "Reads a global SQLITE_STATUS_* counter into the sqlite3_int64 at pCurrent and its highwater mark into the sqlite3_int64 at pHighwater, 8 bytes each, resetting the mark when resetFlag is non-zero. Some counters leave one of the two outputs unwritten.",
    url: c3ref("status"),
    params: ["op", "pCurrent", "pHighwater", "resetFlag"],
    result: "SqliteResultCode",
  },
  sqlite3_auto_extension: {
    doc: "Registers an entry point that SQLite calls for every new connection, where an error it returns fails the open; registering one twice is a no-op. Despite the `void (*)(void)` prototype SQLite calls it as `int xEntryPoint(sqlite3 *db, char **pzErrMsg, const sqlite3_api_routines *pThunk)`, so its function table entry must have that type.",
    url: c3ref("auto_extension"),
    params: ["xEntryPoint"],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "funcptr:i(ppp)"],
      reason: autoExtensionReason,
    },
  },
  sqlite3_cancel_auto_extension: {
    doc: "Unregisters an entry point sqlite3_auto_extension registered, returning 1 when it was registered and 0 otherwise.",
    url: c3ref("cancel_auto_extension"),
    params: ["xEntryPoint"],
    supplement: {
      signature: ["int", "funcptr:i(ppp)"],
      reason: autoExtensionReason,
    },
  },
  sqlite3_reset_auto_extension: {
    doc: "Unregisters every entry point sqlite3_auto_extension registered.",
    url: c3ref("reset_auto_extension"),
    params: [],
    supplement: { signature: ["void"], reason: autoExtensionReason },
  },
  sqlite3_randomness: {
    doc: "Writes N pseudo-random bytes to P. A call with N below 1 or a NULL P writes nothing and makes the next call reseed from the default VFS's xRandomness.",
    url: c3ref("randomness"),
    params: ["N", "P: WasmPtr | NullPtr"],
    supplement: {
      signature: ["void", "int", "*"],
      reason: "SQLite binds it by hand to fill typed arrays.",
    },
  },

  // SQL text.
  sqlite3_complete: {
    doc: "Returns 1 when UTF-8 SQL text ends with a complete statement, a final semicolon token that does not end inside a CREATE TRIGGER body, and 0 otherwise. It tokenizes without parsing, so it does not detect invalid SQL.",
    url: c3ref("complete"),
    params: ["sql"],
  },
  sqlite3_keyword_count: {
    doc: "Returns the number of distinct SQL keywords the library recognizes, which depends on compile-time options.",
    url: c3ref("keyword_check"),
    params: [],
  },
  sqlite3_keyword_name: {
    doc: "Writes the address and byte length of the 0-based index-th SQL keyword, UTF-8 without a NUL terminator in static memory, and returns SQLITE_ERROR when the index is out of range. Both output pointers must be valid.",
    url: c3ref("keyword_check"),
    params: ["index", "pzName", "pnName"],
    result: "SqliteResultCode",
  },
  sqlite3_keyword_check: {
    doc: "Returns non-zero if the nName bytes of UTF-8 at zName, which need no NUL terminator, are an SQL keyword in any letter case, and 0 otherwise.",
    url: c3ref("keyword_check"),
    params: ["zName: WasmPtr", "nName"],
  },
  sqlite3_strglob: {
    doc: "Returns 0 when zStr matches the GLOB pattern zGlob, case-sensitively as SQL's GLOB operator does, and non-zero otherwise.",
    url: c3ref("strglob"),
    params: ["zGlob", "zStr"],
  },
  sqlite3_strlike: {
    doc: "Returns 0 when zStr matches the LIKE pattern zGlob with escape character cEsc, or none for 0, and non-zero otherwise. Like SQL's LIKE operator, it folds only ASCII case.",
    url: c3ref("strlike"),
    params: ["zGlob", "zStr", "cEsc"],
  },
  sqlite3_stricmp: {
    doc: "Compares two UTF-8 strings, folding only ASCII case as SQLite does for identifiers, and returns 0 when they are equal or a negative or positive number that orders them.",
    url: c3ref("stricmp"),
    params: ["zLeft", "zRight"],
  },
  sqlite3_strnicmp: {
    doc: "Compares at most N bytes of two UTF-8 strings, folding only ASCII case as SQLite does for identifiers, and returns 0 when they are equal or a negative or positive number that orders them.",
    url: c3ref("stricmp"),
    params: ["zLeft", "zRight", "N"],
  },

  // Memory.
  sqlite3_malloc: {
    doc: "Allocates at least byteLength bytes, returning NULL when out of memory or when byteLength is zero or negative.",
    url: c3ref("free"),
    params: ["byteLength"],
    result: "SqliteOwnedPtr | NullPtr",
  },
  sqlite3_malloc64: {
    doc: "Allocates memory like sqlite3_malloc with a 64-bit size, returning NULL when out of memory or for zero bytes.",
    url: c3ref("free"),
    params: ["byteLength"],
    result: "SqliteOwnedPtr | NullPtr",
  },
  sqlite3_realloc: {
    doc: "Resizes memory from sqlite3_malloc, keeping its leading bytes, and returns the new address, after which the old one is invalid. A NULL pointer allocates, a size of 0 or less frees and returns NULL, and when out of memory it returns NULL and leaves the old allocation intact.",
    url: c3ref("free"),
    params: ["ptr: SqliteOwnedPtr | NullPtr", "byteLength"],
    result: "SqliteOwnedPtr | NullPtr",
  },
  sqlite3_realloc64: {
    doc: "Resizes memory from sqlite3_malloc, moving its contents to the returned address; NULL memory allocates, and a zero size frees it and returns NULL. When out of memory it returns NULL and leaves the old memory allocated.",
    url: c3ref("free"),
    params: ["ptr: SqliteOwnedPtr | NullPtr", "byteLength"],
    result: "SqliteOwnedPtr | NullPtr",
  },
  sqlite3_msize: {
    doc: "Returns the usable byte size of memory from sqlite3_malloc, sqlite3_realloc or their 64-bit variants, which can exceed the requested size, or 0 for NULL.",
    url: c3ref("free"),
    params: ["ptr: SqliteOwnedPtr | NullPtr"],
  },
  sqlite3_free: {
    doc: "Frees memory from sqlite3_malloc or from a SQLite function that returns owned memory.",
    url: c3ref("free"),
    params: ["ptr: SqliteOwnedPtr | NullPtr"],
  },

  // Connections.
  sqlite3_open: {
    doc: "Opens a database connection for reading and writing, creating the database when it does not exist, with the default VFS. SQLite writes a handle even when opening fails, except when out of memory, and that handle must be closed.",
    url: c3ref("open"),
    params: ["filename", "ppDb"],
    result: "SqliteResultCode",
  },
  sqlite3_open_v2: {
    doc: "Opens a database connection. SQLite writes a handle even when opening fails, except when out of memory, and that handle must be closed.",
    url: c3ref("open"),
    params: ["filename", "ppDb", "flags", "zVfs: CStringPtr | NullPtr"],
    result: "SqliteResultCode",
  },
  sqlite3_close_v2: {
    doc: "Closes a connection. With unfinalized statements the close is deferred and the connection keeps its files open.",
    url: c3ref("close"),
    params: ["db: SqliteDbPtr | NullPtr"],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3*"],
      reason: "SQLite binds it by hand to release JavaScript callbacks first.",
    },
  },
  sqlite3_db_filename: {
    doc: "Returns the absolute filename of a schema of the connection, valid until the schema is detached or the connection closes, or NULL or an empty string for a temporary or in-memory database or an unknown schema. A non-NULL result can be passed to the `sqlite3_uri_*` functions.",
    url: c3ref("db_filename"),
    params: ["db", "zDbName"],
    result: "SqliteFilenamePtr | NullPtr",
  },
  sqlite3_db_name: {
    doc: "Returns the schema name of the connection's N-th database, where 0 is main and 1 is temp, or NULL when N is out of range. SQLite owns the string, which any schema change, such as ATTACH, DETACH, sqlite3_serialize or sqlite3_deserialize, can free.",
    url: c3ref("db_name"),
    params: ["db", "N"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_db_readonly: {
    doc: "Returns 1 if a schema of the connection is read-only, 0 if it is read/write, or -1 when no schema has that name.",
    url: c3ref("db_readonly"),
    params: ["db", "zDbName"],
  },
  sqlite3_txn_state: {
    doc: "Returns a schema's transaction state, SQLITE_TXN_NONE, SQLITE_TXN_READ or SQLITE_TXN_WRITE, the highest across all schemas for NULL, or -1 for an unknown schema.",
    url: c3ref("txn_state"),
    params: ["db", "zSchema: CStringPtr | NullPtr"],
  },
  sqlite3_get_autocommit: {
    doc: "Returns 0 from BEGIN until the COMMIT or ROLLBACK that ends the transaction, and non-zero otherwise. It is the only way to tell whether SQLite rolled back a transaction automatically after an error such as SQLITE_FULL or SQLITE_BUSY.",
    url: c3ref("get_autocommit"),
    params: ["db"],
  },
  sqlite3_limit: {
    doc: "Sets a run-time limit of the connection and returns its prior value; a negative newVal only reads it, and a value above the compile-time maximum is lowered to that maximum.",
    url: c3ref("limit"),
    params: ["db", "id", "newVal"],
  },
  sqlite3_busy_handler: {
    doc: "Sets the connection's only busy handler, replacing any other, including the one sqlite3_busy_timeout sets, or removes it for NULL so a lock fails with SQLITE_BUSY at once. SQLite calls it with pArg and the number of earlier calls for the same lock and retries while it returns non-zero; it must not modify the connection.",
    url: c3ref("busy_handler"),
    params: [
      "db",
      "xBusy: SqliteFunctionPtr | NullPtr",
      "pArg: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_busy_timeout: {
    doc: "Sets a busy handler that sleeps and retries until at least ms milliseconds have passed, replacing any other busy handler; ms of zero or less removes all busy handlers.",
    url: c3ref("busy_timeout"),
    params: ["db", "ms"],
    result: "SqliteResultCode",
  },
  sqlite3_interrupt: {
    doc: "Stops the connection's running statements, and statements started before they all finish, at their earliest opportunity with SQLITE_INTERRUPT; an interrupted write in an explicit transaction rolls the transaction back. With no running statement it does nothing.",
    url: c3ref("interrupt"),
    params: ["db"],
  },
  sqlite3_is_interrupted: {
    doc: "Returns 1 while an sqlite3_interrupt is in effect for the connection, and 0 otherwise.",
    url: c3ref("interrupt"),
    params: ["db"],
  },
  sqlite3_extended_result_codes: {
    doc: "Enables extended result codes for the connection when onoff is non-zero and disables them otherwise. They are disabled by default, and sqlite3_extended_errcode returns them regardless.",
    url: c3ref("extended_result_codes"),
    params: ["db", "onoff"],
    result: "SqliteResultCode",
  },
  sqlite3_file_control: {
    doc: "Calls the xFileControl method of a schema's file, main for a NULL zDbName, with an opcode and its argument and returns its result; the core handles a few opcodes, such as SQLITE_FCNTL_FILE_POINTER, itself. An unknown schema returns SQLITE_ERROR without recording it for sqlite3_errcode.",
    url: c3ref("file_control"),
    params: [
      "db",
      "zDbName: CStringPtr | NullPtr",
      "op",
      "pArg: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_table_column_metadata: {
    doc: "Writes a table column's declared type, collation sequence and NOT NULL, PRIMARY KEY and AUTOINCREMENT flags through the non-NULL output pointers, failing for a missing column or a view; a NULL column name only checks that the table exists. The returned strings stay valid only until the next SQLite call.",
    url: c3ref("table_column_metadata"),
    params: [
      "db",
      "zDbName: CStringPtr | NullPtr",
      "zTableName",
      "zColumnName: CStringPtr | NullPtr",
      "pzDataType: WasmPtr | NullPtr",
      "pzCollSeq: WasmPtr | NullPtr",
      "pNotNull: WasmPtr | NullPtr",
      "pPrimaryKey: WasmPtr | NullPtr",
      "pAutoinc: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_db_status: {
    doc: "Writes the current and highest values of a connection status counter to pCur and pHiwtr, resetting the highest to the current value when resetFlg is non-zero. Values above the int range are truncated; sqlite3_db_status64 returns them in full.",
    url: c3ref("db_status"),
    params: ["db", "op", "pCur", "pHiwtr", "resetFlg"],
    result: "SqliteResultCode",
  },
  sqlite3_db_status64: {
    doc: "Reads a connection's SQLITE_DBSTATUS_* counter into the sqlite3_int64 at pCur and its highwater mark into the sqlite3_int64 at pHiwtr, 8 bytes each, resetting the mark to the current value when resetFlg is non-zero.",
    url: c3ref("db_status"),
    params: ["db", "op", "pCur", "pHiwtr", "resetFlg"],
    result: "SqliteResultCode",
  },
  sqlite3_last_insert_rowid: {
    doc: "Returns the rowid of the connection's most recent successful INSERT into a rowid table, or 0 if there was none. Inside a trigger it returns the trigger's insert until the trigger ends, and a failed INSERT leaves it unchanged.",
    url: c3ref("last_insert_rowid"),
    params: ["db"],
  },
  sqlite3_set_last_insert_rowid: {
    doc: "Sets the value sqlite3_last_insert_rowid returns for the connection without inserting a row.",
    url: c3ref("set_last_insert_rowid"),
    params: ["db", "rowid"],
  },
  sqlite3_changes: {
    doc: "Returns the rows changed by the connection's most recently completed INSERT, UPDATE or DELETE, without changes by triggers, foreign key actions or REPLACE; other statements leave it unchanged, except a DROP TABLE that, with foreign keys on, first deletes the rows of a table that foreign keys reference. The result is undefined above the int range, which sqlite3_changes64 covers.",
    url: c3ref("changes"),
    params: ["db"],
  },
  sqlite3_changes64: {
    doc: "Returns the rows changed by the connection's most recently completed INSERT, UPDATE or DELETE, without changes by triggers, foreign key actions or REPLACE; other statements leave it unchanged, except a DROP TABLE that, with foreign keys on, first deletes the rows of a table that foreign keys reference.",
    url: c3ref("changes"),
    params: ["db"],
  },
  sqlite3_total_changes: {
    doc: "Returns the rows inserted, updated or deleted by the connection's completed statements since it opened, including those of triggers and foreign key actions. The result is undefined beyond the int range, which sqlite3_total_changes64 avoids.",
    url: c3ref("total_changes"),
    params: ["db"],
  },
  sqlite3_total_changes64: {
    doc: "Returns the number of rows changed by INSERT, UPDATE and DELETE statements on the connection since it opened, counting trigger and foreign key action changes but not REPLACE conflict deletions. Other connections do not change it, and other statements do not either, except a DROP TABLE that, with foreign keys on, first deletes the rows of a table that foreign keys reference.",
    url: c3ref("total_changes"),
    params: ["db"],
  },
  sqlite3_exec: {
    doc: "Runs zero or more semicolon-separated UTF-8 SQL statements, stopping at the first error, and calls the callback, unless NULL, with pArg for each result row; a non-zero callback result stops with SQLITE_ABORT. Unless errmsg is NULL, it receives NULL on success or an error message the caller frees with sqlite3_free.",
    url: c3ref("exec"),
    params: [
      "db",
      "sql: CStringPtr | NullPtr",
      "callback: SqliteFunctionPtr | NullPtr",
      "pArg: WasmPtr | NullPtr",
      "errmsg: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_serialize: {
    doc: "Copies a schema, NULL meaning main, into memory from sqlite3_malloc64 that the caller frees, writing its byte size as an 8-byte sqlite3_int64 to piSize unless NULL. An empty database first gets its first page from an empty write transaction. Pages are read through the pager, so an encrypted database comes out decrypted, and a page that fails to read comes out zero-filled. Returns NULL when out of memory, for an unknown schema or a database without pages, and with SQLITE_SERIALIZE_NOCOPY returns SQLite's own buffer of a deserialized database, or NULL, instead of a copy, which the caller must neither free nor modify. Only a call whose mFlags is 0 returns memory sqlite3_free accepts.",
    url: c3ref("serialize"),
    params: [
      "db",
      "zSchema: CStringPtr | NullPtr",
      "piSize: WasmPtr | NullPtr",
      "mFlags",
    ],
    result: "WasmPtr | NullPtr",
    overloads: [
      {
        params: [
          "db",
          "zSchema: CStringPtr | NullPtr",
          "piSize: WasmPtr | NullPtr",
          "mFlags: 0",
        ],
        result: "SqliteOwnedPtr | NullPtr",
      },
    ],
  },
  sqlite3_deserialize: {
    doc: "Reopens a schema, main for NULL, as an in-memory database over the first szDb bytes of a szBuf-byte buffer, which must stay valid and unmodified until the connection closes. With SQLITE_DESERIALIZE_FREEONCLOSE, SQLite takes ownership of the sqlite3_malloc'd buffer and frees it, even when deserializing fails.",
    url: c3ref("deserialize"),
    params: [
      "db",
      "zSchema: CStringPtr | NullPtr",
      "pData",
      "szDb",
      "szBuf",
      "mFlags",
    ],
    result: "SqliteResultCode",
  },

  // Errors.
  sqlite3_errcode: {
    doc: "Returns the result code of the connection's most recent API call if that call failed, as a primary code unless extended result codes are enabled.",
    url: c3ref("errcode"),
    params: ["db"],
    result: "SqliteResultCode",
  },
  sqlite3_extended_errcode: {
    doc: "Returns the connection's most recent extended result code.",
    url: c3ref("errcode"),
    params: ["db"],
    result: "SqliteResultCode",
  },
  sqlite3_errmsg: {
    doc: "Returns the English message of the connection's most recent error, or NULL when none is available. SQLite owns the string, which the next call on the connection can overwrite or free.",
    url: c3ref("errcode"),
    params: ["db"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_errstr: {
    doc: "Returns the English description of a result code, or NULL when none is available. The string is static and must not be freed.",
    url: c3ref("errcode"),
    params: ["code: SqliteResultCode"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_error_offset: {
    doc: "Returns the byte offset in the SQL of the most recent error, or -1.",
    url: c3ref("errcode"),
    params: ["db"],
  },
  sqlite3_set_errmsg: {
    doc: "Sets the error code and a copy of zErrMsg, or the code's default message for NULL, that sqlite3_errcode and sqlite3_errmsg report for a connection until SQLite or another call replaces them.",
    url: c3ref("set_errmsg"),
    params: [
      "db",
      "errcode: SqliteResultCode",
      "zErrMsg: CStringPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },

  // Hooks.
  sqlite3_commit_hook: {
    doc: "Sets the connection's commit callback, replacing the previous one, or removes it for NULL, and returns the previous call's pArg, NULL for the first call. SQLite calls it with pArg before each commit and turns the commit into a rollback when it returns non-zero; it must not modify the connection.",
    url: c3ref("commit_hook"),
    params: [
      "db",
      "xCallback: SqliteFunctionPtr | NullPtr",
      "pArg: WasmPtr | NullPtr",
    ],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_rollback_hook: {
    doc: "Registers the callback SQLite calls with pArg whenever a transaction rolls back, except when closing the connection, replacing the previous one; NULL removes it. Returns the previous pArg or NULL; the callback must not use the connection, not even to prepare or step a statement.",
    url: c3ref("commit_hook"),
    params: [
      "db",
      "xCallback: SqliteFunctionPtr | NullPtr",
      "pArg: WasmPtr | NullPtr",
    ],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_update_hook: {
    doc: "Registers the connection's callback for each row inserted, updated or deleted in a rowid table, replacing the previous one or removing it for NULL, and returns the previous pArg or NULL. The callback must not modify the connection and does not fire for WITHOUT ROWID tables, REPLACE conflict deletions or the truncate optimization.",
    url: c3ref("update_hook"),
    params: [
      "db",
      "xCallback: SqliteFunctionPtr | NullPtr",
      "pArg: WasmPtr | NullPtr",
    ],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_trace_v2: {
    doc: "Registers the connection's one trace callback for the SQLITE_TRACE_* events in uMask, replacing any previous one; a NULL callback or a zero mask disables tracing. The callback receives the event code, pCtx and two event-specific pointers, and should return 0.",
    url: c3ref("trace_v2"),
    params: [
      "db",
      "uMask",
      "xCallback: SqliteFunctionPtr | NullPtr",
      "pCtx: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_collation_needed: {
    doc: "Sets the connection's callback for an undefined collation sequence, replacing the previous one. SQLite calls it with pArg, the connection, the preferred text encoding and the UTF-8 collation name, and the callback should register that collation.",
    url: c3ref("collation_needed"),
    params: [
      "db",
      "pArg: WasmPtr | NullPtr",
      "xCollNeeded: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },

  // Statements.
  sqlite3_prepare_v2: {
    doc: "Compiles the first statement of UTF-8 SQL as sqlite3_prepare_v3 does with no flags, reading at most nByte bytes or up to a NUL when nByte is negative, and writes the statement to `*ppStmt` and the address of the uncompiled rest to `*pzTail`. `*ppStmt` is NULL on error and for SQL without a statement, such as only a comment; the caller finalizes a non-NULL one.",
    url: c3ref("prepare"),
    params: ["db", "zSql", "nByte", "ppStmt", "pzTail: WasmPtr | NullPtr"],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3*", "*", "int", "**", "**"],
      reason: "SQLite binds it by hand to accept JavaScript strings.",
    },
  },
  sqlite3_prepare_v3: {
    doc: "Compiles the first statement of UTF-8 SQL, reading at most nByte bytes or up to a NUL when nByte is negative, and writes the statement to `*ppStmt` and the address of the uncompiled rest to `*pzTail`. `*ppStmt` is NULL on error and for SQL without a statement, such as only a comment; the caller finalizes a non-NULL one.",
    url: c3ref("prepare"),
    params: [
      "db",
      "zSql",
      "nByte",
      "prepFlags",
      "ppStmt",
      "pzTail: WasmPtr | NullPtr",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3*", "*", "int", "int", "**", "**"],
      reason: "SQLite binds it by hand to accept JavaScript strings.",
    },
  },
  sqlite3_step: {
    doc: "Evaluates a statement one step, returning SQLITE_ROW, SQLITE_DONE or an error.",
    url: c3ref("step"),
    params: ["pStmt"],
    result: "SqliteResultCode",
  },
  sqlite3_reset: {
    doc: "Resets a statement so it can run again, keeping its bindings. It returns the error of a failed most recent step, and can fail on its own, such as with SQLITE_BUSY when an INSERT with RETURNING stepped only once cannot commit.",
    url: c3ref("reset"),
    params: ["pStmt"],
    result: "SqliteResultCode",
  },
  sqlite3_finalize: {
    doc: "Destroys a prepared statement and returns the error of its most recent evaluation if that failed, otherwise SQLITE_OK; NULL is a harmless no-op.",
    url: c3ref("finalize"),
    params: ["pStmt: SqliteStmtPtr | NullPtr"],
    result: "SqliteResultCode",
  },
  sqlite3_next_stmt: {
    doc: "Returns the connection's first prepared statement for a NULL pStmt, otherwise the one after pStmt, or NULL when there is none.",
    url: c3ref("next_stmt"),
    params: ["pDb", "pStmt: SqliteStmtPtr | NullPtr"],
    result: "SqliteStmtPtr | NullPtr",
  },
  sqlite3_db_handle: {
    doc: "Returns the connection a prepared statement belongs to.",
    url: c3ref("db_handle"),
    params: ["pStmt"],
  },
  sqlite3_sql: {
    doc: "Returns the SQL text a statement was prepared from, which SQLite frees when the statement is finalized, or NULL for a statement from the legacy sqlite3_prepare, which this build does not export.",
    url: c3ref("expanded_sql"),
    params: ["pStmt"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_expanded_sql: {
    doc: "Returns the statement's SQL with bound parameters expanded as literals, in memory the caller frees with sqlite3_free, or NULL when out of memory, above SQLITE_LIMIT_LENGTH, or when built with SQLITE_OMIT_TRACE.",
    url: c3ref("expanded_sql"),
    params: ["pStmt"],
    result: "SqliteOwnedCStringPtr | NullPtr",
  },
  sqlite3_stmt_busy: {
    doc: "Returns non-zero when a statement has been stepped but has neither returned SQLITE_DONE nor been reset, and 0 for NULL.",
    url: c3ref("stmt_busy"),
    params: ["pStmt: SqliteStmtPtr | NullPtr"],
  },
  sqlite3_stmt_readonly: {
    doc: "Returns non-zero when a statement cannot directly change the database file, though application-defined functions or virtual tables it calls still might. Transaction control, ATTACH and DETACH count as read-only; BEGIN IMMEDIATE, BEGIN EXCLUSIVE and any statement that might write do not.",
    url: c3ref("stmt_readonly"),
    params: ["pStmt"],
  },
  sqlite3_stmt_explain: {
    doc: "Makes a statement behave as if its SQL began with EXPLAIN (eMode 1), EXPLAIN QUERY PLAN (2) or neither (0), possibly re-preparing it. It fails while the statement is active, so reset it first.",
    url: c3ref("stmt_explain"),
    params: ["pStmt", "eMode"],
    result: "SqliteResultCode",
  },
  sqlite3_stmt_isexplain: {
    doc: "Returns 1 for an EXPLAIN statement, 2 for EXPLAIN QUERY PLAN, and 0 for an ordinary statement or NULL.",
    url: c3ref("stmt_isexplain"),
    params: ["pStmt: SqliteStmtPtr | NullPtr"],
  },
  sqlite3_stmt_status: {
    doc: "Returns one of a statement's SQLITE_STMTSTATUS_* counters, and resets it to 0 afterwards when resetFlg is non-zero.",
    url: c3ref("stmt_status"),
    params: ["pStmt", "op", "resetFlg"],
  },

  // Binding parameters.
  sqlite3_bind_parameter_count: {
    doc: "Returns the index of a statement's largest SQL parameter, which is the number of parameters unless `?NNN` parameters leave gaps.",
    url: c3ref("bind_parameter_count"),
    params: ["pStmt"],
  },
  sqlite3_bind_parameter_index: {
    doc: "Returns the 1-based index of the SQL parameter with a UTF-8 name that includes its prefix, such as `:name`, or 0 when no parameter matches.",
    url: c3ref("bind_parameter_index"),
    params: ["pStmt", "zName"],
  },
  sqlite3_bind_parameter_name: {
    doc: "Returns the name of the SQL parameter at a 1-based index, including its prefix as in `:name` or `?NNN`, or NULL for a nameless `?` parameter or an index out of range. The statement owns the string.",
    url: c3ref("bind_parameter_name"),
    params: ["pStmt", "index"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_bind_null: {
    doc: "Binds NULL to a parameter.",
    url: c3ref("bind_blob"),
    params: ["pStmt", "index"],
    result: "SqliteResultCode",
    correctedResult: intResultCorrection,
  },
  sqlite3_bind_int: {
    doc: "Binds a 32-bit integer to a parameter. The wasm boundary converts the number with ToInt32, so a fraction is truncated and a value outside the int32 range wraps silently.",
    url: c3ref("bind_blob"),
    params: ["pStmt", "index", "value"],
    result: "SqliteResultCode",
  },
  sqlite3_bind_int64: {
    doc: "Binds a 64-bit integer to a parameter. The wasm boundary wraps a bigint outside the int64 range silently.",
    url: c3ref("bind_blob"),
    params: ["pStmt", "index", "value"],
    result: "SqliteResultCode",
  },
  sqlite3_bind_double: {
    doc: "Binds a double to a parameter; SQLite stores NaN as NULL.",
    url: c3ref("bind_blob"),
    params: ["pStmt", "index", "value"],
    result: "SqliteResultCode",
  },
  sqlite3_bind_text: {
    doc: "Binds UTF-8 text to a parameter: n bytes, which may include NUL characters, or up to the first NUL when n is negative. A NULL address binds SQL NULL.",
    url: c3ref("bind_blob"),
    params: [
      "pStmt",
      "index",
      "value: WasmPtr | NullPtr",
      "n",
      "destructor: SqliteDestructor",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3_stmt*", "int", "*", "int", "*"],
      reason:
        "SQLite binds it by hand to accept JavaScript strings and typed arrays.",
    },
  },
  sqlite3_bind_blob: {
    doc: "Binds n bytes to a parameter; a negative n is undefined behavior. A NULL address binds SQL NULL, so an empty blob needs a non-NULL address.",
    url: c3ref("bind_blob"),
    params: [
      "pStmt",
      "index",
      "value: WasmPtr | NullPtr",
      "n",
      "destructor: SqliteDestructor",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3_stmt*", "int", "*", "int", "*"],
      reason: "SQLite binds it by hand to accept typed arrays.",
    },
  },
  sqlite3_bind_zeroblob: {
    doc: "Binds a blob of n zero bytes to a parameter without allocating its content; a negative n binds a zero-length blob.",
    url: c3ref("bind_blob"),
    params: ["pStmt", "index", "n"],
    result: "SqliteResultCode",
  },
  sqlite3_bind_pointer: {
    doc: "Binds SQL NULL carrying pPtr tagged with the type string zPType, which only sqlite3_value_pointer with an equal type string returns. The type string should be static because SQLite keeps its address, and SQLite calls xDestructor, unless NULL, with pPtr when done, even when binding fails.",
    url: c3ref("bind_blob"),
    params: [
      "pStmt",
      "index",
      "pPtr: WasmPtr | NullPtr",
      "zPType",
      "xDestructor: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
  },
  sqlite3_clear_bindings: {
    doc: "Sets every parameter of a statement to NULL, which sqlite3_reset does not do.",
    url: c3ref("clear_bindings"),
    params: ["pStmt"],
    result: "SqliteResultCode",
  },

  // Columns.
  sqlite3_column_count: {
    doc: "Returns the number of result columns of a statement.",
    url: c3ref("column_count"),
    params: ["pStmt"],
  },
  sqlite3_data_count: {
    doc: "Returns the number of columns in the statement's current row, or 0 when the last step did not return SQLITE_ROW or the statement is NULL.",
    url: c3ref("data_count"),
    params: ["pStmt: SqliteStmtPtr | NullPtr"],
  },
  sqlite3_column_name: {
    doc: "Returns the name of a result column, which is its AS alias or else unspecified, or NULL when out of memory or the index is out of range. The statement owns the string until it is finalized or re-prepared.",
    url: c3ref("column_name"),
    params: ["pStmt", "N"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_column_decltype: {
    doc: "Returns the declared type of the table column a result column comes from, or NULL when the result column is an expression or subquery. The statement owns the string.",
    url: c3ref("column_decltype"),
    params: ["pStmt", "iCol"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_column_type: {
    doc: "Returns the storage class of a result column in the current row. Read it before any other column function, which can convert the value.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
    result: "SqliteDataType",
  },
  sqlite3_column_int: {
    doc: "Returns a result column of the current row as a 32-bit integer, converting other types; an integer outside the 32-bit range keeps only its low 32 bits.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
  },
  sqlite3_column_int64: {
    doc: "Returns a result column of the current row as a 64-bit integer, converting other types as CAST does, and 0 for NULL.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
  },
  sqlite3_column_double: {
    doc: "Returns a result column of the current row as a double, converting other types, such as NULL to 0.0.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
  },
  sqlite3_column_text: {
    doc: "Returns the address of a result column as NUL-terminated UTF-8 text that can contain NUL characters, so read its length with sqlite3_column_bytes afterwards. Returns NULL for SQL NULL and when out of memory, which sqlite3_errcode tells apart; the text stays valid until the next step, reset or finalize, or a conversion by another column call.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
    result: "WasmPtr | NullPtr",
    supplement: {
      signature: ["*", "sqlite3_stmt*", "int"],
      reason: proxyTextReason,
    },
  },
  sqlite3_column_blob: {
    doc: "Returns the address of a result column's bytes, or NULL for a zero-length blob, SQL NULL or out of memory; call it before sqlite3_column_bytes. The memory stays valid until a type conversion of the column or the next step, reset or finalize, and SQLite frees it.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_column_bytes: {
    doc: "Returns the byte length of the text or blob the preceding column call returned.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
  },
  sqlite3_column_value: {
    doc: "Returns a result column of the current row as an unprotected sqlite3_value, valid until the next step, reset or finalize. This build is single-threaded (SQLITE_THREADSAFE=0), so an unprotected value works wherever a protected one does, and sqlite3_value_dup copies it to outlive the row.",
    url: c3ref("column_blob"),
    params: ["pStmt", "iCol"],
  },

  // Values.
  sqlite3_value_type: {
    doc: "Returns a value's initial fundamental data type. Read it before the other value functions, whose conversions can change it.",
    url: c3ref("value_blob"),
    params: ["value"],
    result: "SqliteDataType",
  },
  sqlite3_value_numeric_type: {
    doc: "Converts a value that looks like a number to INTEGER or FLOAT when no information is lost, and returns its resulting fundamental data type.",
    url: c3ref("value_blob"),
    params: ["value"],
    result: "SqliteDataType",
  },
  sqlite3_value_int: {
    doc: "Returns a value as a 32-bit integer, converting other types as CAST does and truncating a larger integer to its low 32 bits, and 0 for NULL.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_int64: {
    doc: "Returns a value as a 64-bit integer, converting other storage classes as sqlite3_column_int64 does.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_double: {
    doc: "Returns a value as a double, converting other types as CAST does, and 0.0 for NULL.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_text: {
    doc: "Returns the address of a protected value as NUL-terminated UTF-8 text that can contain NUL characters, so read its length with sqlite3_value_bytes afterwards. Returns NULL for SQL NULL and when out of memory, and a later call that converts the value can invalidate the text.",
    url: c3ref("value_blob"),
    params: ["value"],
    result: "WasmPtr | NullPtr",
    supplement: {
      signature: ["*", "sqlite3_value*"],
      reason: proxyTextReason,
    },
  },
  sqlite3_value_blob: {
    doc: "Returns the address of a value's bytes, rendering a number as text, or NULL for a zero-length value or SQL NULL. Call it before sqlite3_value_bytes; a later text conversion invalidates the address.",
    url: c3ref("value_blob"),
    params: ["value"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_value_bytes: {
    doc: "Returns the byte length of the blob or UTF-8 text the preceding sqlite3_value_blob or sqlite3_value_text call returned, without the NUL terminator; 0 for NULL.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_pointer: {
    doc: "Returns the pointer sqlite3_bind_pointer or sqlite3_result_pointer attached to a value under a type name equal to zPType by strcmp, and NULL otherwise.",
    url: c3ref("value_blob"),
    params: ["value", "zPType"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_value_subtype: {
    doc: "Returns the subtype of an application-defined function argument, as sqlite3_result_subtype set it, or 0. The reading function should be registered with SQLITE_SUBTYPE, or it might get 0 in corner cases.",
    url: c3ref("value_subtype"),
    params: ["value"],
  },
  sqlite3_value_frombind: {
    doc: "Returns non-zero when a value came from a bound parameter rather than a literal, a column or an expression.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_nochange: {
    doc: "Within a virtual table's xUpdate, returns non-zero when the value's column is unchanged by the UPDATE because xColumn set no result; such a value otherwise looks like NULL. Anywhere else the result is meaningless.",
    url: c3ref("value_blob"),
    params: ["value"],
  },
  sqlite3_value_dup: {
    doc: "Copies a value into a protected value the caller frees with sqlite3_value_free. Returns NULL for NULL or when out of memory, and a pointer value copies as SQL NULL.",
    url: c3ref("value_dup"),
    params: ["value: SqliteValuePtr | NullPtr"],
    result: "SqliteOwnedValuePtr | NullPtr",
  },
  sqlite3_value_free: {
    doc: "Frees a value from sqlite3_value_dup; NULL is a no-op.",
    url: c3ref("value_dup"),
    params: ["value: SqliteOwnedValuePtr | NullPtr"],
  },

  // Application-defined functions and collations.
  sqlite3_create_function: {
    doc: "Adds, redefines or, with xFunc, xStep and xFinal all NULL, removes an SQL function of the connection: xFunc implements a scalar function, xStep with xFinal an aggregate. nArg is the argument count or -1 for any, and eTextRep the preferred text encoding, optionally with flags such as SQLITE_DETERMINISTIC and SQLITE_DIRECTONLY.",
    url: c3ref("create_function"),
    params: [
      "db",
      "zFunctionName",
      "nArg",
      "eTextRep",
      "pApp: WasmPtr | NullPtr",
      "xFunc: SqliteFunctionPtr | NullPtr",
      "xStep: SqliteFunctionPtr | NullPtr",
      "xFinal: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: [
        "int",
        "sqlite3*",
        "string",
        "int",
        "int",
        "*",
        "funcptr:v(pip)",
        "funcptr:v(pip)",
        "funcptr:v(p)",
      ],
      reason: callbacksReason,
    },
  },
  sqlite3_create_function_v2: {
    doc: "Works like sqlite3_create_function, and SQLite calls a non-NULL xDestroy with pApp when the function is redefined or removed, when the connection closes, and when this call fails.",
    url: c3ref("create_function"),
    params: [
      "db",
      "zFunctionName",
      "nArg",
      "eTextRep",
      "pApp: WasmPtr | NullPtr",
      "xFunc: SqliteFunctionPtr | NullPtr",
      "xStep: SqliteFunctionPtr | NullPtr",
      "xFinal: SqliteFunctionPtr | NullPtr",
      "xDestroy: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: [
        "int",
        "sqlite3*",
        "string",
        "int",
        "int",
        "*",
        "funcptr:v(pip)",
        "funcptr:v(pip)",
        "funcptr:v(p)",
        "funcptr:v(p)",
      ],
      reason: callbacksReason,
    },
  },
  sqlite3_overload_function: {
    doc: "Ensures a global SQL function with this name and argument count exists, creating a placeholder that raises an error when called, so a virtual table's xFindFunction can overload it.",
    url: c3ref("overload_function"),
    params: ["db", "zFuncName", "nArg"],
    result: "SqliteResultCode",
  },
  sqlite3_create_collation: {
    doc: "Adds, replaces or, with a NULL xCompare, removes a collation named zName for text in the eTextRep encoding. `xCompare(pArg, n1, s1, n2, s2)` compares two strings of the given byte lengths and returns a negative number, zero or a positive number; SQLite behavior is undefined when the comparison is inconsistent.",
    url: c3ref("create_collation"),
    params: [
      "db",
      "zName",
      "eTextRep",
      "pArg: WasmPtr | NullPtr",
      "xCompare: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: ["int", "sqlite3*", "string", "int", "*", "funcptr:i(pipip)"],
      reason: callbacksReason,
    },
  },
  sqlite3_create_collation_v2: {
    doc: "Works like sqlite3_create_collation, and SQLite calls a non-NULL xDestroy with pArg when the collation is replaced or the connection closes. Unlike other SQLite functions, it does not call xDestroy when this call fails, so the caller then disposes of pArg.",
    url: c3ref("create_collation"),
    params: [
      "db",
      "zName",
      "eTextRep",
      "pArg: WasmPtr | NullPtr",
      "xCompare: SqliteFunctionPtr | NullPtr",
      "xDestroy: SqliteFunctionPtr | NullPtr",
    ],
    result: "SqliteResultCode",
    supplement: {
      signature: [
        "int",
        "sqlite3*",
        "string",
        "int",
        "*",
        "funcptr:i(pipip)",
        "funcptr:v(p)",
      ],
      reason: callbacksReason,
    },
  },
  sqlite3_user_data: {
    doc: "Returns the user data pointer the running application-defined function was registered with.",
    url: c3ref("user_data"),
    params: ["context"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_context_db_handle: {
    doc: "Returns the connection that registered the application-defined function being called.",
    url: c3ref("context_db_handle"),
    params: ["context"],
  },
  sqlite3_aggregate_context: {
    doc: "Returns the state memory of the current aggregate function instance: the first call allocates nBytes of zeroed memory, later calls return the same buffer, and SQLite frees it when the aggregate concludes. Returns NULL when the first call passes nBytes of zero or less or runs out of memory.",
    url: c3ref("aggregate_context"),
    params: ["context", "nBytes"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_get_auxdata: {
    doc: "Returns the auxiliary data sqlite3_set_auxdata associated with the 0-based N-th argument of the current function call, or NULL when there is none or SQLite discarded it.",
    url: c3ref("get_auxdata"),
    params: ["context", "N"],
    result: "WasmPtr | NullPtr",
  },
  sqlite3_set_auxdata: {
    doc: "Attaches pAux to the N-th argument of the running application-defined function, where sqlite3_get_auxdata finds it while the argument stays the same. SQLite may discard it at any time, even before this call returns, calling a non-NULL xDelete with pAux, so pAux must not be used afterwards.",
    url: c3ref("get_auxdata"),
    params: [
      "context",
      "N",
      "pAux: WasmPtr | NullPtr",
      "xDelete: SqliteFunctionPtr | NullPtr",
    ],
  },
  sqlite3_result_null: {
    doc: "Sets an application-defined function's result to NULL.",
    url: c3ref("result_blob"),
    params: ["context"],
  },
  sqlite3_result_int: {
    doc: "Sets an application-defined function's result to a 32-bit integer. The wasm boundary converts the number with ToInt32, so a fraction is truncated and a value outside the int32 range wraps silently.",
    url: c3ref("result_blob"),
    params: ["context", "value"],
  },
  sqlite3_result_int64: {
    doc: "Sets an application-defined function's result to a 64-bit integer. The wasm boundary wraps a bigint outside the int64 range silently.",
    url: c3ref("result_blob"),
    params: ["context: SqliteContextPtr", "value"],
  },
  sqlite3_result_double: {
    doc: "Sets an application-defined function's result to a double; SQLite stores NaN as NULL.",
    url: c3ref("result_blob"),
    params: ["context", "value"],
  },
  sqlite3_result_text: {
    doc: "Sets an application-defined function's result to UTF-8 text of n bytes, or up to its NUL terminator when n is negative. A NULL address sets SQL NULL, as for sqlite3_bind_text.",
    url: c3ref("result_blob"),
    params: [
      "context",
      "value: WasmPtr | NullPtr",
      "n",
      "destructor: SqliteDestructor",
    ],
  },
  sqlite3_result_blob: {
    doc: "Sets an application-defined function's result to n bytes. A NULL address sets SQL NULL, as for sqlite3_bind_blob, so an empty blob needs a non-NULL address or sqlite3_result_zeroblob.",
    url: c3ref("result_blob"),
    params: [
      "context",
      "value: WasmPtr | NullPtr",
      "n",
      "destructor: SqliteDestructor",
    ],
  },
  sqlite3_result_zeroblob: {
    doc: "Sets an application-defined function's result to a blob of n zero bytes, 0 for a negative n. A size beyond SQLITE_LIMIT_LENGTH makes the function fail with SQLITE_TOOBIG.",
    url: c3ref("result_blob"),
    params: ["context", "n"],
  },
  sqlite3_result_zeroblob64: {
    doc: "Sets an application-defined function's result to a blob of n zero bytes. Returns SQLITE_TOOBIG, and makes the function fail with that error, when n exceeds the connection's length limit.",
    url: c3ref("result_blob"),
    params: ["context: SqliteContextPtr", "n"],
    result: "SqliteResultCode",
  },
  sqlite3_result_pointer: {
    doc: "Sets an application-defined function's result to an SQL NULL carrying pPtr, which sqlite3_value_pointer returns for an equal type name. SQLite keeps zPType itself, so it must outlive the value, and calls a non-NULL xDestructor with pPtr when done with it.",
    url: c3ref("result_blob"),
    params: [
      "context",
      "pPtr: WasmPtr | NullPtr",
      "zPType",
      "xDestructor: SqliteFunctionPtr | NullPtr",
    ],
  },
  sqlite3_result_subtype: {
    doc: "Sets the subtype of an application-defined function's result, keeping only its low 8 bits. The function must be registered with SQLITE_RESULT_SUBTYPE: without it the subtype might not be set, and a build with SQLITE_STRICT_SUBTYPE, such as this one, fails the function with an error. SQLite's table declares the first parameter as sqlite3_value*, but the C function takes sqlite3_context*.",
    url: c3ref("result_subtype"),
    params: ["context: SqliteContextPtr", "subtype"],
  },
  sqlite3_result_error: {
    doc: "Makes an application-defined function fail with a copy of a UTF-8 message of n bytes, or up to its NUL terminator when n is negative. It resets the error code to SQLITE_ERROR, so call sqlite3_result_error_code after it.",
    url: c3ref("result_blob"),
    params: ["context", "message: WasmPtr", "n"],
  },
  sqlite3_result_error_code: {
    doc: "Makes an application-defined function fail with a result code instead of SQLITE_ERROR, and with the code's default message when no result was set. Call it after sqlite3_result_error, which resets the code to SQLITE_ERROR.",
    url: c3ref("result_blob"),
    params: ["context", "code: SqliteResultCode"],
  },
  sqlite3_result_error_nomem: {
    doc: "Makes an application-defined function fail with SQLITE_NOMEM, as a failed memory allocation would.",
    url: c3ref("result_blob"),
    params: ["context"],
  },
  sqlite3_result_error_toobig: {
    doc: "Makes an application-defined function fail with SQLITE_TOOBIG, reporting a string or blob too big to represent.",
    url: c3ref("result_blob"),
    params: ["context"],
  },

  // URI filenames.
  sqlite3_uri_parameter: {
    doc: "Returns the value of a URI query parameter of a filename, an empty string for a parameter without a value, or NULL when it is absent or the filename is NULL.",
    url: c3ref("uri_boolean"),
    params: ["z: SqliteFilenamePtr | NullPtr", "zParam"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_uri_boolean: {
    doc: "Returns 1 when a filename's URI query parameter is yes, true or on in any case or starts with a non-zero number, 0 when it is no, false or off or starts with zero, and whether bDefault is non-zero otherwise, including for a NULL filename.",
    url: c3ref("uri_boolean"),
    params: ["z: SqliteFilenamePtr | NullPtr", "zParam", "bDefault"],
  },
  sqlite3_uri_int64: {
    doc: "Returns a URI query parameter of a filename SQLite created as a 64-bit integer, or iDefault when the filename is NULL or the parameter is missing or not a decimal or hexadecimal integer.",
    url: c3ref("uri_boolean"),
    params: ["z: SqliteFilenamePtr | NullPtr", "zParam", "iDefault"],
  },
  sqlite3_uri_key: {
    doc: "Returns the name of a filename's N-th URI query parameter, counting from 0, or NULL when N is out of range.",
    url: c3ref("uri_boolean"),
    params: ["z", "N"],
    result: "CStringPtr | NullPtr",
  },

  // VFS.
  sqlite3_vfs_find: {
    doc: "Returns a registered VFS by name, or the default VFS for NULL.",
    url: c3ref("vfs_find"),
    params: ["zVfsName: CStringPtr | NullPtr"],
    result: "SqliteVfsPtr | NullPtr",
  },
  sqlite3_vfs_register: {
    doc: "Registers a VFS, optionally as the default. The struct and its name must outlive the registration.",
    url: c3ref("vfs_find"),
    params: ["vfs", "makeDflt"],
    result: "SqliteResultCode",
  },
  sqlite3_vfs_unregister: {
    doc: "Unregisters a VFS. When it was the default, SQLite makes an arbitrary other VFS the default.",
    url: c3ref("vfs_find"),
    params: ["vfs"],
    result: "SqliteResultCode",
  },

  // Virtual tables.
  sqlite3_vtab_on_conflict: {
    doc: "Returns the ON CONFLICT mode of the statement that called xUpdate for an INSERT or UPDATE: SQLITE_ROLLBACK, SQLITE_IGNORE, SQLITE_FAIL, SQLITE_ABORT or SQLITE_REPLACE. Only xUpdate may call it.",
    url: c3ref("vtab_on_conflict"),
    params: ["db"],
  },
  sqlite3_vtab_nochange: {
    doc: "Returns non-zero inside xColumn when the column is fetched for an UPDATE that does not change it, so xColumn may leave the result unset. It is only a hint and may always return 0.",
    url: c3ref("vtab_nochange"),
    params: ["context"],
  },
  sqlite3_vtab_collation: {
    doc: "Returns the collation name for text comparisons of an xBestIndex constraint, `BINARY` by default, or NULL for an index outside aConstraint. Only xBestIndex may call it, with the sqlite3_index_info it received.",
    url: c3ref("vtab_collation"),
    params: ["indexInfo", "iCons"],
    result: "CStringPtr | NullPtr",
  },
  sqlite3_vtab_distinct: {
    doc: "Returns how the planner needs a virtual table's rows for orderByConsumed: 0 in aOrderBy order, 1 with equal aOrderBy values adjacent, 2 adjacent with duplicates over colUsed omittable, 3 in order with such duplicates omittable. Only xBestIndex may call it.",
    url: c3ref("vtab_distinct"),
    params: ["indexInfo"],
  },
  sqlite3_vtab_in: {
    doc: "Returns non-zero when constraint iCons is an IN operator that can be processed all at once; bHandle 1 or 0 requests or declines that processing, and -1 only asks. Only xBestIndex may call it.",
    url: c3ref("vtab_in"),
    params: ["indexInfo", "iCons", "bHandle"],
  },
  sqlite3_vtab_in_first: {
    doc: "Writes the first right-hand value of an all-at-once IN constraint, given its xFilter argument, to ppOut and returns SQLITE_OK, or writes NULL and returns SQLITE_DONE when there is none. The value stays valid until the next call or the end of xFilter.",
    url: c3ref("vtab_in_first"),
    params: ["pVal", "ppOut"],
    result: "SqliteResultCode",
  },
  sqlite3_vtab_in_next: {
    doc: "Writes the next right-hand value of an all-at-once IN constraint, given its xFilter argument, to ppOut and returns SQLITE_OK, or writes NULL and returns SQLITE_DONE after the last. The value stays valid until the next call or the end of xFilter.",
    url: c3ref("vtab_in_first"),
    params: ["pVal", "ppOut"],
    result: "SqliteResultCode",
  },
  sqlite3_vtab_rhs_value: {
    doc: "Writes the right-hand value of constraint iCons to ppVal and returns SQLITE_OK, or writes NULL and returns SQLITE_NOTFOUND when it is not known, which is usual unless it is a literal. Only xBestIndex may call it, and the value is freed when xBestIndex returns.",
    url: c3ref("vtab_rhs_value"),
    params: ["indexInfo", "iCons", "ppVal"],
    result: "SqliteResultCode",
  },
};

/** The metadata of every variadic C function, in output order. */
export const variadicBindings: Readonly<Record<string, VariadicBinding>> = {
  sqlite3_config: {
    doc: [
      "Changes a global option of the library, which works only before sqlite3_initialize or after sqlite3_shutdown and otherwise returns SQLITE_MISUSE. The loader initializes the library, so call it after sqlite3_shutdown, then initialize the library again with initializeSqliteWasm, as sqlite3_shutdown explains.",
      "",
      "- SQLITE_CONFIG_MEMSTATUS, SQLITE_CONFIG_SMALL_MALLOC, SQLITE_CONFIG_URI and SQLITE_CONFIG_COVERING_INDEX_SCAN turn a feature on for a non-zero value and off for 0.",
      "- SQLITE_CONFIG_STMTJRNL_SPILL sets the byte size above which statement journals spill to disk. SQLITE_CONFIG_SORTERREF_SIZE fails with SQLITE_ERROR, since this build does not enable sorter references.",
      "- SQLITE_CONFIG_LOOKASIDE sets the default lookaside allocator of new connections to cnt slots of sz bytes.",
      "- SQLITE_CONFIG_MEMDB_MAXSIZE sets the default maximum size of a database sqlite3_deserialize creates.",
      "",
      "The C function is variadic, so the binary does not export it. This calls the build's shim for the option's arguments and, as SQLite's JavaScript does, returns SQLITE_NOTFOUND for every other option without calling wasm, because the shims pass their arguments to the C function unchecked.",
    ].join("\n"),
    url: c3ref("config"),
    params: [],
    opPrefix: "SQLITE_CONFIG_",
    unsupportedOps: [
      "SQLITE_CONFIG_SINGLETHREAD",
      "SQLITE_CONFIG_MULTITHREAD",
      "SQLITE_CONFIG_SERIALIZED",
      "SQLITE_CONFIG_MALLOC",
      "SQLITE_CONFIG_GETMALLOC",
      "SQLITE_CONFIG_SCRATCH",
      "SQLITE_CONFIG_PAGECACHE",
      "SQLITE_CONFIG_HEAP",
      "SQLITE_CONFIG_MUTEX",
      "SQLITE_CONFIG_GETMUTEX",
      "SQLITE_CONFIG_PCACHE",
      "SQLITE_CONFIG_GETPCACHE",
      "SQLITE_CONFIG_LOG",
      "SQLITE_CONFIG_PCACHE2",
      "SQLITE_CONFIG_GETPCACHE2",
      "SQLITE_CONFIG_SQLLOG",
      "SQLITE_CONFIG_MMAP_SIZE",
      "SQLITE_CONFIG_WIN32_HEAPSIZE",
      "SQLITE_CONFIG_PCACHE_HDRSZ",
      "SQLITE_CONFIG_PMASZ",
    ],
    variants: [
      {
        shim: "sqlite3__wasm_config_i",
        shimDoc:
          "The build's shim that calls sqlite3_config with one int for any option, unchecked. sqlite3_config calls it only for the options that take an int.",
        signature: ["int", "int", "int"],
        args: ["value"],
        ops: [
          "SQLITE_CONFIG_MEMSTATUS",
          "SQLITE_CONFIG_URI",
          "SQLITE_CONFIG_COVERING_INDEX_SCAN",
          "SQLITE_CONFIG_STMTJRNL_SPILL",
          "SQLITE_CONFIG_SMALL_MALLOC",
          "SQLITE_CONFIG_SORTERREF_SIZE",
        ],
        opType: {
          name: "SqliteConfigIntOp",
          doc: "An option of sqlite3_config that takes one int.",
        },
      },
      {
        shim: "sqlite3__wasm_config_ii",
        shimDoc:
          "The build's shim that calls sqlite3_config with two ints for any option, unchecked. sqlite3_config calls it only for SQLITE_CONFIG_LOOKASIDE.",
        signature: ["int", "int", "int", "int"],
        args: ["sz", "cnt"],
        ops: ["SQLITE_CONFIG_LOOKASIDE"],
      },
      {
        shim: "sqlite3__wasm_config_j",
        shimDoc:
          "The build's shim that calls sqlite3_config with a 64-bit integer for any option, unchecked. sqlite3_config calls it only for SQLITE_CONFIG_MEMDB_MAXSIZE.",
        signature: ["int", "int", "i64"],
        args: ["value"],
        ops: ["SQLITE_CONFIG_MEMDB_MAXSIZE"],
      },
    ],
    otherOps: "SQLITE_NOTFOUND",
  },
  sqlite3_db_config: {
    doc: [
      "Changes or reads an option of a connection, returning SQLITE_OK or an error code.",
      "",
      "- SQLITE_DBCONFIG_MAINDBNAME renames the main schema to zName, which SQLite does not copy, so it must stay unchanged until the connection closes.",
      "- SQLITE_DBCONFIG_LOOKASIDE sets the connection's lookaside allocator to cnt slots of sz bytes in buf, which must be 8-byte aligned and hold sz times cnt bytes, or in memory SQLite allocates for a NULL buf. It fails with SQLITE_BUSY while lookaside memory is in use.",
      "- SQLITE_DBCONFIG_FP_DIGITS sets the significant digits of floating-point to text conversion to value when it is from 4 to 23, leaving the setting unchanged otherwise, and writes the resulting setting to the int at pResult unless it is NULL.",
      "- Every other option is a flag: a positive value sets it, 0 clears it and a negative value only reads it, and the resulting 0 or 1 is written to the int at pResult unless it is NULL. Changing a flag expires the connection's prepared statements.",
      "",
      "The C function is variadic, so the binary does not export it. This calls the build's shim for the option's arguments and, as SQLite's JavaScript does, returns SQLITE_MISUSE for any other option without calling wasm.",
    ].join("\n"),
    url: c3ref("db_config"),
    params: ["db"],
    opPrefix: "SQLITE_DBCONFIG_",
    unsupportedOps: ["SQLITE_DBCONFIG_MAX"],
    variants: [
      {
        shim: "sqlite3__wasm_db_config_s",
        shimDoc:
          "The build's shim that calls sqlite3_db_config with a string for SQLITE_DBCONFIG_MAINDBNAME, and returns SQLITE_MISUSE for any other option.",
        signature: ["int", "sqlite3*", "int", "string"],
        args: ["zName"],
        ops: ["SQLITE_DBCONFIG_MAINDBNAME"],
      },
      {
        shim: "sqlite3__wasm_db_config_pii",
        shimDoc:
          "The build's shim that calls sqlite3_db_config with a pointer and two ints for SQLITE_DBCONFIG_LOOKASIDE, and returns SQLITE_MISUSE for any other option.",
        signature: ["int", "sqlite3*", "int", "*", "int", "int"],
        args: ["buf: WasmPtr | NullPtr", "sz", "cnt"],
        ops: ["SQLITE_DBCONFIG_LOOKASIDE"],
      },
      {
        shim: "sqlite3__wasm_db_config_ip",
        shimDoc:
          "The build's shim that calls sqlite3_db_config with an int and an `int*` for the options that take them, and returns SQLITE_MISUSE for any other option.",
        signature: ["int", "sqlite3*", "int", "int", "int*"],
        args: ["value", "pResult?: WasmPtr | NullPtr"],
        ops: [
          "SQLITE_DBCONFIG_ENABLE_FKEY",
          "SQLITE_DBCONFIG_ENABLE_TRIGGER",
          "SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION",
          "SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE",
          "SQLITE_DBCONFIG_ENABLE_QPSG",
          "SQLITE_DBCONFIG_TRIGGER_EQP",
          "SQLITE_DBCONFIG_RESET_DATABASE",
          "SQLITE_DBCONFIG_DEFENSIVE",
          "SQLITE_DBCONFIG_WRITABLE_SCHEMA",
          "SQLITE_DBCONFIG_LEGACY_ALTER_TABLE",
          "SQLITE_DBCONFIG_DQS_DML",
          "SQLITE_DBCONFIG_DQS_DDL",
          "SQLITE_DBCONFIG_ENABLE_VIEW",
          "SQLITE_DBCONFIG_LEGACY_FILE_FORMAT",
          "SQLITE_DBCONFIG_TRUSTED_SCHEMA",
          "SQLITE_DBCONFIG_STMT_SCANSTATUS",
          "SQLITE_DBCONFIG_REVERSE_SCANORDER",
          "SQLITE_DBCONFIG_ENABLE_ATTACH_CREATE",
          "SQLITE_DBCONFIG_ENABLE_ATTACH_WRITE",
          "SQLITE_DBCONFIG_ENABLE_COMMENTS",
          "SQLITE_DBCONFIG_FP_DIGITS",
        ],
        opType: {
          name: "SqliteDbConfigIntOp",
          doc: "An option of sqlite3_db_config that takes an int and an `int*`: a flag, or SQLITE_DBCONFIG_FP_DIGITS.",
        },
      },
    ],
    otherOps: "SQLITE_MISUSE",
  },
  sqlite3_vtab_config: {
    doc: [
      "Sets an option of the virtual table whose xCreate or xConnect method is running, the only place it may be called.",
      "",
      "- SQLITE_VTAB_CONSTRAINT_SUPPORT with a non-zero value declares that xUpdate returns SQLITE_CONSTRAINT only before changing anything, so SQLite can honor the statement's ON CONFLICT mode.",
      "- SQLITE_VTAB_INNOCUOUS marks the virtual table as safe to use in triggers and views, and SQLITE_VTAB_DIRECTONLY prohibits that. Both ignore value.",
      "",
      "The C function is variadic, so the binary does not export it. The build's shim returns SQLITE_MISUSE for any other option, including SQLITE_VTAB_USES_ALL_SCHEMAS, which it does not support.",
    ].join("\n"),
    url: c3ref("vtab_config"),
    params: ["db"],
    opPrefix: "SQLITE_VTAB_",
    unsupportedOps: ["SQLITE_VTAB_USES_ALL_SCHEMAS"],
    variants: [
      {
        shim: "sqlite3__wasm_vtab_config",
        shimDoc:
          "The build's shim that calls sqlite3_vtab_config with an int for SQLITE_VTAB_CONSTRAINT_SUPPORT and without it for SQLITE_VTAB_INNOCUOUS and SQLITE_VTAB_DIRECTONLY, and returns SQLITE_MISUSE for any other option.",
        signature: ["int", "sqlite3*", "int", "int"],
        args: ["value"],
        ops: [
          "SQLITE_VTAB_CONSTRAINT_SUPPORT",
          "SQLITE_VTAB_INNOCUOUS",
          "SQLITE_VTAB_DIRECTONLY",
        ],
        opType: {
          name: "SqliteVtabConfigOp",
          doc: "An option of sqlite3_vtab_config the build's shim supports.",
        },
      },
    ],
  },
};
