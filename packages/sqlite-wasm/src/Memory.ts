/**
 * Standalone helpers for wasm memory: allocation, UTF-8, bytes, scratch memory,
 * and integer ranges.
 *
 * Like the CApi functions, each helper that touches the instance takes
 * {@link SqliteWasmDep} and returns the operation, so a database binds it once.
 *
 * Rules the helpers follow and their callers must too:
 *
 * - Allocate at least one byte. `sqlite3_malloc(0)` returns NULL, and binding a
 *   NULL address binds SQL NULL, so an empty string or blob would silently
 *   become NULL.
 * - Take the heap view after allocating. Growing memory detaches the previous
 *   `ArrayBuffer`, and writing to a detached view does nothing.
 * - Decode by byte length with a decoder that keeps a leading byte order mark, so
 *   text round-trips exactly, including embedded NUL characters. The default
 *   `TextDecoder` strips it.
 *
 * @module
 */

import { disposable, err, ok, type Result, type Typed } from "@evolu/common";
import type {
  CStringPtr,
  SqliteOwnedCStringPtr,
  SqliteOwnedPtr,
  WasmPtr,
} from "./Pointer.ts";
import type { SqliteWasmDep } from "./Wasm.ts";

const utf8Encoder = /*#__PURE__*/ new TextEncoder();

// Keeps a leading byte order mark, which the default decoder strips.
const utf8Decoder = /*#__PURE__*/ new TextDecoder("utf-8", { ignoreBOM: true });

/** `sqlite3_malloc` returned NULL. */
export interface SqliteNoMemError extends Typed<"SqliteNoMem"> {
  readonly byteLength: number;
}

/**
 * Allocates at least one byte with `sqlite3_malloc`, so a zero-length value
 * keeps a non-NULL address.
 *
 * A request above {@link maxInt32} fails without calling `sqlite3_malloc`, which
 * takes a C int and would wrap it.
 */
export const allocWasm =
  (deps: SqliteWasmDep) =>
  (byteLength: number): Result<SqliteOwnedPtr, SqliteNoMemError> => {
    const ptr =
      byteLength > maxInt32
        ? 0
        : deps.sqliteWasm.exports.sqlite3_malloc(Math.max(1, byteLength));
    return ptr === 0 ? err({ type: "SqliteNoMem", byteLength }) : ok(ptr);
  };

/**
 * Copies a string into new memory as a NUL-terminated UTF-8 C string, which the
 * caller frees with `sqlite3_free`.
 *
 * UTF-8 cannot encode a lone surrogate, which becomes U+FFFD, as with
 * `TextEncoder`, so a caller that needs the exact text checks
 * `String.prototype.isWellFormed` first.
 */
export const allocCString =
  (deps: SqliteWasmDep) =>
  (value: string): Result<SqliteOwnedCStringPtr, SqliteNoMemError> => {
    const bytes = utf8Encoder.encode(value);
    const allocated = allocWasm(deps)(bytes.length + 1);
    if (!allocated.ok) return allocated;
    const ptr = allocated.value as SqliteOwnedCStringPtr;
    const heap = deps.sqliteWasm.getHeapU8();
    heap.set(bytes, ptr);
    heap[ptr + bytes.length] = 0;
    return ok(ptr);
  };

/**
 * Encodes a string as UTF-8 into existing memory and returns the byte length,
 * without a NUL terminator.
 *
 * The memory needs up to three bytes per UTF-16 code unit; text that does not
 * fit is cut at a character boundary, so reserve `value.length * 3` bytes. A
 * lone surrogate becomes U+FFFD, as in {@link allocCString}.
 */
export const writeUtf8 =
  (deps: SqliteWasmDep) =>
  (value: string, ptr: WasmPtr, capacity: number): number =>
    utf8Encoder.encodeInto(
      value,
      deps.sqliteWasm.getHeapU8().subarray(ptr, ptr + capacity),
    ).written;

/** Decodes a NUL-terminated C string, such as an error message or a column name. */
export const readCString =
  (deps: SqliteWasmDep) =>
  (ptr: CStringPtr): string => {
    const heap = deps.sqliteWasm.getHeapU8();
    return utf8Decoder.decode(heap.subarray(ptr, heap.indexOf(0, ptr)));
  };

/**
 * Decodes UTF-8 of a known byte length, such as a text column, keeping a
 * leading byte order mark and embedded NUL characters.
 */
export const readUtf8 =
  (deps: SqliteWasmDep) =>
  (ptr: WasmPtr, byteLength: number): string =>
    utf8Decoder.decode(
      deps.sqliteWasm.getHeapU8().subarray(ptr, ptr + byteLength),
    );

/**
 * Copies bytes out of wasm memory into a new `ArrayBuffer`, so the result can
 * be transferred to another worker.
 */
export const copyWasmBytes =
  (deps: SqliteWasmDep) =>
  (ptr: WasmPtr, byteLength: number): Uint8Array<ArrayBuffer> =>
    deps.sqliteWasm.getHeapU8().slice(ptr, ptr + byteLength);

/** Copies bytes into wasm memory. */
export const writeWasmBytes =
  (deps: SqliteWasmDep) =>
  (ptr: WasmPtr, bytes: Uint8Array): void => {
    deps.sqliteWasm.getHeapU8().set(bytes, ptr);
  };

/**
 * Reusable memory for output parameters and bind values, allocated once per
 * database instead of once per call.
 *
 * A callback inside a call, such as a collation-needed callback or a trace
 * callback, can run another call on the same database, which reuses this
 * memory. The outer call is unaffected, because SQLite copies a value bound
 * with SQLITE_TRANSIENT at once and writes an output parameter after the
 * callbacks of the call. What SQLite reads or writes before a callback and the
 * caller uses after it needs memory of its own: SQL, which SQLite parses in
 * place and copies only after the parse, and the size `sqlite3_serialize`
 * writes before it finalizes its query.
 */
export interface SqliteScratch extends Disposable {
  /**
   * Sixteen bytes, 8-byte aligned, for output parameters such as `ppDb`,
   * `ppStmt` and `pzTail`.
   */
  readonly out: WasmPtr;

  /**
   * Returns memory of at least the given length, growing it when needed. The
   * previous contents are not kept, and the address is valid until the next
   * call. Growth doubles the capacity, so reallocations stay rare as values
   * grow, or, when that much memory is not available, allocates the length
   * alone. A failure leaves the scratch empty, so later calls are unaffected.
   *
   * Binding text or a blob from here with SQLITE_TRANSIENT is faster than
   * allocating per value: SQLite copies into a buffer it reuses.
   */
  readonly reserve: (byteLength: number) => Result<WasmPtr, SqliteNoMemError>;
}

/** Creates a {@link SqliteScratch}. */
export const createSqliteScratch = (
  deps: SqliteWasmDep,
): Result<SqliteScratch, SqliteNoMemError> => {
  const out = allocWasm(deps)(16);
  if (!out.ok) return out;

  let buffer: SqliteOwnedPtr | null = null;
  let capacity = 0;

  using disposer = new DisposableStack();
  disposer.defer(() => {
    deps.sqliteWasm.exports.sqlite3_free(out.value);
  });
  disposer.defer(() => {
    if (buffer != null) deps.sqliteWasm.exports.sqlite3_free(buffer);
  });

  return ok(
    disposable<SqliteScratch>(
      {
        out: out.value,
        reserve: (byteLength) => {
          if (buffer != null) {
            if (byteLength <= capacity) return ok(buffer);
            // The contents need not be kept, so the old memory goes first.
            deps.sqliteWasm.exports.sqlite3_free(buffer);
            buffer = null;
          }
          // Twice the capacity keeps reallocations rare, but when it is not
          // available, the requested length alone may still be.
          let newCapacity = Math.max(byteLength, capacity * 2);
          let allocated = allocWasm(deps)(newCapacity);
          if (!allocated.ok && newCapacity > byteLength) {
            newCapacity = byteLength;
            allocated = allocWasm(deps)(newCapacity);
          }
          if (!allocated.ok) {
            capacity = 0;
            return allocated;
          }
          buffer = allocated.value;
          capacity = newCapacity;
          return ok(buffer);
        },
      },
      disposer,
    ),
  );
};

/** The largest C int. */
export const maxInt32 = 0x7fff_ffff;

/**
 * Whether a number is a 32-bit integer, which binds with `sqlite3_bind_int`
 * without a BigInt.
 */
export const isInt32 = (value: number): boolean =>
  Number.isInteger(value) && value >= -maxInt32 - 1 && value <= maxInt32;

/** The largest SQLite INTEGER, 2^63 - 1. */
export const maxSqliteInt64 = 2n ** 63n - 1n;

/** The smallest SQLite INTEGER, -2^63. */
export const minSqliteInt64 = -(2n ** 63n);

/**
 * Whether a bigint fits a SQLite INTEGER.
 *
 * The wasm boundary converts a bigint to i64 modulo 2^64 without an error, so
 * anything passed to `sqlite3_bind_int64` must be checked first.
 */
export const isSqliteInt64 = (value: bigint): boolean =>
  BigInt.asIntN(64, value) === value;
