/**
 * `@evolu/sqlite-wasm` 2.2.4, whose SQLite3 Multiple Ciphers encrypted the
 * databases of `@evolu/web` 3 with its `sqlcipher` scheme, as the reference the
 * codec's format is checked against. In Node.js, its default VFS keeps files in
 * memory; these helpers read and write them as stored through its `unix-none`
 * VFS, which doesn't encrypt.
 *
 * @module
 */
import { assertEqual, bytesToHex } from "@evolu/common";
import sqlite3InitModule from "@evolu/sqlite-wasm-2.2.4";

export type SqliteJs = Awaited<ReturnType<typeof sqlite3InitModule>>;

/** Loads a new instance of `@evolu/sqlite-wasm` 2.2.4. */
export const setupSqliteJs = (): Promise<SqliteJs> =>
  sqlite3InitModule({ print: () => undefined, printErr: () => undefined });

/** The SQL that keys a 2.2.4 connection with a raw key, as Evolu does. */
export const sqliteJsKeySql = (key: Uint8Array): string =>
  `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "raw:${bytesToHex(key)}";`;

/** Reads a file of 2.2.4's file system as stored; a missing one is empty. */
export const readSqliteJsFile = (
  sqliteJs: SqliteJs,
  path: string,
): Uint8Array<ArrayBuffer> => {
  const { wasm, call, close } = openSqliteJsFile(sqliteJs, path);
  const pSize = wasm.alloc(8);
  assertEqual(call(ioMethodOffsets.xFileSize)(pSize), 0);
  const size = Number(wasm.peek64(pSize));
  // 2.2.4's alloc refuses 0 bytes.
  const pBuffer = wasm.alloc(Math.max(size, 1));
  assertEqual(call(ioMethodOffsets.xRead)(pBuffer, size, 0n), 0);
  const bytes = wasm.heap8u().slice(pBuffer, pBuffer + size);
  wasm.dealloc(pBuffer);
  wasm.dealloc(pSize);
  close();
  return bytes;
};

/** Replaces a file of 2.2.4's file system with bytes, as stored. */
export const writeSqliteJsFile = (
  sqliteJs: SqliteJs,
  path: string,
  bytes: Uint8Array,
): void => {
  const { wasm, call, close } = openSqliteJsFile(sqliteJs, path);
  assertEqual(call(ioMethodOffsets.xTruncate)(BigInt(bytes.length)), 0);
  // Its unix-none in Node.js fails a write of 128 KiB or more with
  // SQLITE_FULL, so the file is written in chunks.
  const chunkSize = 65536;
  const pBuffer = wasm.alloc(chunkSize);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    wasm.heap8u().set(chunk, pBuffer);
    assertEqual(
      call(ioMethodOffsets.xWrite)(pBuffer, chunk.length, BigInt(offset)),
      0,
    );
  }
  wasm.dealloc(pBuffer);
  close();
};

// The offsets of the members these helpers call in wasm32's sqlite3_vfs and
// sqlite3_io_methods, where every member takes 4 bytes.
const vfsOffsets = { szOsFile: 4, xOpen: 24 };
const ioMethodOffsets = {
  xClose: 4,
  xRead: 8,
  xWrite: 12,
  xTruncate: 16,
  xFileSize: 24,
};

// SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_MAIN_DB.
const openFlags = 0x02 | 0x04 | 0x100;

/**
 * Opens a file through 2.2.4's `unix-none` VFS and returns a caller of its I/O
 * methods, bound to the file.
 */
const openSqliteJsFile = (sqliteJs: SqliteJs, path: string) => {
  const { capi, wasm } = sqliteJs;
  const vfs = capi.sqlite3_vfs_find("unix-none");
  const method = (struct: number, offset: number) =>
    wasm.functionEntry(wasm.peekPtr(struct + offset)) as (
      ...args: ReadonlyArray<number | bigint>
    ) => number;
  const pFile = wasm.alloc(wasm.peek32(vfs + vfsOffsets.szOsFile));
  const zPath = wasm.allocCString(path, false);
  assertEqual(
    method(vfs, vfsOffsets.xOpen)(vfs, zPath, pFile, openFlags, 0),
    0,
  );
  const io = wasm.peekPtr(pFile);
  const call =
    (offset: number) =>
    (...args: ReadonlyArray<number | bigint>): number =>
      method(io, offset)(pFile, ...args);
  return {
    wasm,
    call,
    close: () => {
      assertEqual(call(ioMethodOffsets.xClose)(), 0);
      wasm.dealloc(pFile);
      wasm.dealloc(zPath);
    },
  };
};
