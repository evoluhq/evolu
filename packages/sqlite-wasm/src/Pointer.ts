/**
 * Branded pointers into SQLite's wasm memory and function table.
 *
 * At runtime every pointer is a wasm32 address, a plain number. The brands keep
 * C types apart, so a statement cannot be passed where a connection is
 * expected, borrowed memory cannot be freed, and no JavaScript string converts
 * to a C string implicitly. Only this package creates pointer values, from what
 * the wasm returns.
 *
 * The loader caps memory at 2 GiB (32768 pages), so every address is a
 * non-negative i32 and reads with `getUint32` need no `>>> 0`.
 *
 * @module
 */

import type { Brand } from "@evolu/common";
import type {
  SQLITE_STATIC,
  SQLITE_TRANSIENT,
  SQLITE_WASM_DEALLOC,
} from "./Constants.ts";

/** An address in the wasm heap. */
export type WasmPtr = number & Brand<"WasmPtr">;

/**
 * The C NULL pointer.
 *
 * Functions that can return NULL include it in their result type, and a `=== 0`
 * check narrows it away.
 */
export type NullPtr = 0;

/**
 * A NUL-terminated UTF-8 string.
 *
 * Returned C strings are borrowed from SQLite: copy them before the next call
 * on the same object and never free them.
 */
export type CStringPtr = WasmPtr & Brand<"CString">;

/**
 * Memory allocated with `sqlite3_malloc`.
 *
 * The holder frees it with `sqlite3_free` or hands it to SQLite, for example as
 * a bind value with {@link SQLITE_WASM_DEALLOC}.
 */
export type SqliteOwnedPtr = WasmPtr & Brand<"SqliteOwned">;

/**
 * A NUL-terminated UTF-8 string in memory allocated with `sqlite3_malloc`,
 * which the holder frees with `sqlite3_free`.
 */
export type SqliteOwnedCStringPtr = SqliteOwnedPtr & CStringPtr;

/** An open database connection, `sqlite3*`. */
export type SqliteDbPtr = WasmPtr & Brand<"SqliteDb">;

/** A prepared statement, `sqlite3_stmt*`. */
export type SqliteStmtPtr = WasmPtr & Brand<"SqliteStmt">;

/**
 * A dynamically typed SQL value, `sqlite3_value*`, such as a column value or an
 * argument of an application-defined function.
 */
export type SqliteValuePtr = WasmPtr & Brand<"SqliteValue">;

/**
 * A protected value copied with `sqlite3_value_dup`, which the holder frees
 * with `sqlite3_value_free`.
 *
 * Column values, function arguments and the other values SQLite passes are
 * borrowed, so `sqlite3_value_free` rejects them.
 */
export type SqliteOwnedValuePtr = SqliteValuePtr & Brand<"SqliteOwnedValue">;

/** The context of an application-defined function call, `sqlite3_context*`. */
export type SqliteContextPtr = WasmPtr & Brand<"SqliteContext">;

/** A VFS struct, `sqlite3_vfs*`. */
export type SqliteVfsPtr = WasmPtr & Brand<"SqliteVfs">;

/**
 * A file SQLite opened through a VFS, `sqlite3_file*`.
 *
 * SQLite allocates it with the VFS's `szOsFile` bytes before calling `xOpen`.
 */
export type SqliteFilePtr = WasmPtr & Brand<"SqliteFile">;

/**
 * A database filename SQLite created, `sqlite3_filename`, as `xOpen` receives
 * it.
 *
 * SQLite stores the URI parameters after the name, where the `sqlite3_uri_*`
 * functions read them, so no other C string can take its place.
 */
export type SqliteFilenamePtr = CStringPtr & Brand<"SqliteFilename">;

/**
 * The query planner's exchange with a virtual table's `xBestIndex`,
 * `sqlite3_index_info*`.
 */
export type SqliteIndexInfoPtr = WasmPtr & Brand<"SqliteIndexInfo">;

/**
 * A C function pointer, which in wasm is an index into the function table, not
 * a memory address.
 */
export type SqliteFunctionPtr = number & Brand<"SqliteFunctionPtr">;

/**
 * The destructor argument of `sqlite3_bind_text`, `sqlite3_bind_blob`,
 * `sqlite3_result_text` and `sqlite3_result_blob`.
 *
 * {@link SQLITE_STATIC} promises the memory outlives the value,
 * {@link SQLITE_TRANSIENT} makes SQLite copy it, and a function pointer such as
 * {@link SQLITE_WASM_DEALLOC} hands it to SQLite, which frees it even when the
 * call fails.
 */
export type SqliteDestructor =
  typeof SQLITE_STATIC | typeof SQLITE_TRANSIENT | SqliteFunctionPtr;
