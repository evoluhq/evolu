/**
 * `@evolu/sqlite-wasm` 2.2.4 in Node.js, the reference for the pool's
 * encryption: its SQLite3 Multiple Ciphers encrypted the databases of
 * `@evolu/web` 3 with the `sqlcipher` scheme. Its default VFS in Node.js is
 * `multipleciphers-unix-none` over an in-memory file system, whose files these
 * helpers read and write as they are stored, to copy them from and to a pool.
 *
 * @module
 */

import { assertEqual, bytesToHex, getOrThrow } from "@evolu/common";
import sqlite3InitModule from "@evolu/sqlite-wasm-2.2.4";
import {
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_READWRITE,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type { TestSahPool } from "./_sahPool.ts";

export type SqliteJs = Awaited<ReturnType<typeof sqlite3InitModule>>;

/** Loads a new instance of `@evolu/sqlite-wasm` 2.2.4. */
export const setupSqliteJs = (): Promise<SqliteJs> =>
  sqlite3InitModule({ print: () => undefined, printErr: () => undefined });

/**
 * The SQL that keys a 2.2.4 connection with the `sqlcipher` scheme and a raw
 * key, followed by the salt a new database stores, when given.
 */
export const sqliteJsRawKeySql = (key: Uint8Array, salt?: Uint8Array): string =>
  `PRAGMA cipher = 'sqlcipher'; PRAGMA key = "raw:${bytesToHex(key)}${salt == null ? "" : bytesToHex(salt)}";`;

/**
 * Reads a file of 2.2.4's file system as it is stored. A missing file is
 * created empty.
 */
export const readSqliteJsFile = (
  sqliteJs: SqliteJs,
  path: string,
): Uint8Array<ArrayBuffer> => {
  const { wasm, call, close } = openSqliteJsFile(sqliteJs, path);
  const pSize = wasm.alloc(8);
  assertEqual(call("xFileSize")(pSize), SQLITE_OK);
  const size = Number(wasm.peek64(pSize));
  // 2.2.4's alloc refuses 0 bytes.
  const pBuffer = wasm.alloc(Math.max(size, 1));
  assertEqual(call("xRead")(pBuffer, size, 0n), SQLITE_OK);
  const bytes = wasm.heap8u().slice(pBuffer, pBuffer + size);
  close();
  return bytes;
};

/** Writes a file of 2.2.4's file system as it is stored. */
export const writeSqliteJsFile = (
  sqliteJs: SqliteJs,
  path: string,
  bytes: Uint8Array,
): void => {
  const { wasm, call, close } = openSqliteJsFile(sqliteJs, path);
  // 2.2.4's unix-none in Node.js fails a write of 128 KiB or more with
  // SQLITE_FULL, so the file is written in chunks.
  const chunkSize = 65536;
  const pBuffer = wasm.alloc(chunkSize);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    wasm.heap8u().set(chunk, pBuffer);
    assertEqual(
      call("xWrite")(pBuffer, chunk.length, BigInt(offset)),
      SQLITE_OK,
    );
  }
  close();
};

/** Writes a file into the pool through its VFS, as it is stored. */
export const writePoolFile = (
  t: TestSahPool,
  path: string,
  bytes: Uint8Array,
  fileType = SQLITE_OPEN_MAIN_DB,
): void => {
  const { rc, pFile } = t.openFile(
    path,
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | fileType,
  );
  assertEqual(rc, SQLITE_OK);
  const pBuffer = getOrThrow(allocWasm(t)(bytes.length));
  t.sqliteWasm.getHeapU8().set(bytes, pBuffer);
  assertEqual(t.callIo(pFile, "xWrite", pBuffer, bytes.length, 0n), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
};

/**
 * Opens a file of 2.2.4's file system through its `unix-none` VFS, which does
 * not encrypt, and returns its I/O methods, bound to the file.
 */
const openSqliteJsFile = (sqliteJs: SqliteJs, path: string) => {
  const { capi, wasm } = sqliteJs;
  const vfs = capi.sqlite3_vfs_find("unix-none");
  const method = (struct: number, offset: number) =>
    wasm.functionEntry(wasm.peekPtr(struct + offset)) as (
      ...args: ReadonlyArray<number | bigint>
    ) => number;
  const pFile = wasm.alloc(
    wasm.peek32(vfs + sqlite3_vfs_layout.members.szOsFile.offset),
  );
  assertEqual(
    method(vfs, sqlite3_vfs_layout.members.xOpen.offset)(
      vfs,
      wasm.allocCString(path, false),
      pFile,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
      0,
    ),
    SQLITE_OK,
  );
  const io = wasm.peekPtr(pFile);
  const call =
    (name: keyof typeof sqlite3_io_methods_layout.members) =>
    (...args: ReadonlyArray<number | bigint>) =>
      method(io, sqlite3_io_methods_layout.members[name].offset)(
        pFile,
        ...args,
      );
  return {
    wasm,
    call,
    close: () => {
      assertEqual(call("xClose")(), SQLITE_OK);
    },
  };
};
