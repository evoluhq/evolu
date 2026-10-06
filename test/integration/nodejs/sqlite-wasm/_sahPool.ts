/**
 * Opens a `SahPool` on a fresh instance and a {@link FakeOpfs}, and drives its
 * VFS directly, as SQLite does: methods are read from the `sqlite3_vfs` and
 * `sqlite3_io_methods` structs and called through the function table.
 *
 * @module
 */

import {
  assert,
  getOrThrow,
  testCreateRun,
  type Result,
  type TestRunDefaultDeps,
} from "@evolu/common";
import {
  sqlite3_open_v2,
  sqlite3_vfs_find,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  OpfsName,
  sahPoolHeaderSize,
  sahPoolOpaqueDirectoryName,
  openSahPool,
  type SahPool,
  type SahPoolError,
  type SahPoolOptions,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READWRITE,
  sqlite3_file_layout,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
  type SqliteResultCode,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  SqliteDbPtr,
  SqliteFilePtr,
  SqliteVfsPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { setupFakeOpfs, type FakeOpfs } from "./_fakeOpfs.ts";
import { setupDatabase, type TestDatabase } from "./_sqliteWasm.ts";

/** A pool on a fake OPFS, with helpers that call its VFS. */
export interface TestSahPool extends TestDatabase {
  readonly fake: FakeOpfs;
  readonly directory: SahPoolOptions["directory"];
  /** The directory's path in the fake OPFS, its names joined with `/`. */
  readonly directoryPath: string;
  readonly pool: SahPool;

  /** Opens a pool on the same instance and fake OPFS. */
  readonly openPool: (
    directory?: SahPoolOptions["directory"],
  ) => Promise<Result<SahPool, SahPoolError>>;

  /** Returns the pool's registered VFS, or 0 when there is none. */
  readonly findVfs: (vfsName?: string) => SqliteVfsPtr | 0;

  /** Calls a method of the pool's VFS, passing the VFS first. */
  readonly callVfs: (
    name: keyof typeof sqlite3_vfs_layout.members,
    ...args: ReadonlyArray<number | bigint>
  ) => number;

  /**
   * Calls the VFS's `xOpen` with a fresh `sqlite3_file` of `szOsFile` bytes,
   * filled with 0xff so a method that leaves `pMethods` alone shows, and
   * returns the result code, the file and the output flags.
   */
  readonly openFile: (
    name: string | null,
    flags: number,
  ) => {
    readonly rc: number;
    readonly pFile: SqliteFilePtr;
    readonly outFlags: number;
  };

  /** Calls an I/O method of an open file through its `pMethods`. */
  readonly callIo: (
    pFile: SqliteFilePtr,
    name: keyof typeof sqlite3_io_methods_layout.members,
    ...args: ReadonlyArray<number | bigint>
  ) => number;

  /**
   * Opens a database on the pool's VFS, or the named one, returning the handle
   * SQLite returns even on failure.
   */
  readonly openDatabase: (
    filename: string,
    options?: { readonly flags?: number; readonly vfsName?: string },
  ) => { readonly rc: SqliteResultCode; readonly db: SqliteDbPtr };

  /** Returns the file names of the pool's slots, in creation order. */
  readonly slotNames: () => ReadonlyArray<string>;

  /** Returns the bytes of a slot, by file name. */
  readonly readSlot: (fileName: string) => Uint8Array<ArrayBuffer>;

  /** Returns the bytes of the first slot whose header maps a path. */
  readonly readMappedSlot: () => Uint8Array<ArrayBuffer>;

  /** Returns the fake OPFS path of the slot whose header maps the path. */
  readonly findSlotPath: (path: string) => string;
}

/**
 * Opens a pool in a directory of an empty, or the given, fake OPFS, on a fresh
 * instance with fresh or the given dependencies.
 */
export const setupSahPool = async ({
  directory = [OpfsName.orThrow(".evolu")],
  fake = setupFakeOpfs(),
  deps,
}: {
  directory?: SahPoolOptions["directory"];
  fake?: FakeOpfs;
  deps?: TestRunDefaultDeps;
} = {}): Promise<TestSahPool> => {
  const t = await setupDatabase(deps);

  const openPool = async (poolDirectory = directory) => {
    await using run = testCreateRun({ ...t, opfsRoot: fake.opfsRoot });
    return await run(openSahPool({ directory: poolDirectory }));
  };

  const pool = getOrThrow(await openPool());

  const findVfs = (vfsName = pool.vfsName) =>
    sqlite3_vfs_find(t)(t.cString(vfsName));

  const callFunction = (
    struct: number,
    offset: number,
    ...args: ReadonlyArray<unknown>
  ): number => {
    const method: unknown = t.sqliteWasm.functionTable.get(
      t.readPtr((struct + offset) as WasmPtr),
    );
    assert(typeof method === "function", "The method is NULL");
    return (method as (...args: ReadonlyArray<unknown>) => number)(...args);
  };

  const callVfs: TestSahPool["callVfs"] = (name, ...args) => {
    const vfs = findVfs();
    assert(vfs !== 0, "The pool's VFS is not registered");
    return callFunction(
      vfs,
      sqlite3_vfs_layout.members[name].offset,
      vfs,
      ...args,
    );
  };

  const openFile: TestSahPool["openFile"] = (name, flags) => {
    const vfs = findVfs();
    assert(vfs !== 0, "The pool's VFS is not registered");
    const szOsFile = t.readPtr(
      (vfs + sqlite3_vfs_layout.members.szOsFile.offset) as WasmPtr,
    );
    const pFile = getOrThrow(
      allocWasm(t)(szOsFile),
    ) as WasmPtr as SqliteFilePtr;
    t.sqliteWasm.getHeapU8().fill(0xff, pFile, pFile + szOsFile);
    const pOutFlags = getOrThrow(allocWasm(t)(4));
    t.sqliteWasm.getHeapDataView().setInt32(pOutFlags, -1, true);
    // SQLite passes a name followed by its URI parameters, which end with an
    // empty one.
    const zName = name == null ? 0 : t.cString(`${name}\0\0`);
    const rc = callVfs("xOpen", zName, pFile, flags, pOutFlags);
    return {
      rc,
      pFile,
      outFlags: t.sqliteWasm.getHeapDataView().getInt32(pOutFlags, true),
    };
  };

  const callIo: TestSahPool["callIo"] = (pFile, name, ...args) => {
    const pMethods = t.readPtr(
      (pFile + sqlite3_file_layout.members.pMethods.offset) as WasmPtr,
    );
    return callFunction(
      pMethods,
      sqlite3_io_methods_layout.members[name].offset,
      pFile,
      ...args,
    );
  };

  const openDatabase: TestSahPool["openDatabase"] = (
    filename,
    {
      flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      vfsName = pool.vfsName,
    } = {},
  ) => {
    const rc = sqlite3_open_v2(t)(
      t.cString(filename),
      t.scratch.out,
      flags,
      t.cString(vfsName),
    );
    return { rc, db: t.readPtr(t.scratch.out) as SqliteDbPtr };
  };

  const directoryPath = directory.join("/");
  const opaque = `${directoryPath}/${sahPoolOpaqueDirectoryName}`;

  const readSlot = (fileName: string) => {
    const bytes = fake.readFile(`${opaque}/${fileName}`);
    assert(bytes != null, `No slot ${fileName}`);
    return bytes;
  };

  return {
    ...t,
    fake,
    directory,
    directoryPath,
    pool,
    openPool,
    findVfs,
    callVfs,
    openFile,
    callIo,
    openDatabase,
    slotNames: () => fake.listFiles(opaque),
    readSlot,
    findSlotPath: (path) => {
      const fileName = fake.listFiles(opaque).find((name) => {
        const bytes = readSlot(name);
        return (
          new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0))) === path
        );
      });
      assert(fileName != null, `No slot maps ${path}`);
      return `${opaque}/${fileName}`;
    },
    readMappedSlot: () => {
      const bytes = fake
        .listFiles(opaque)
        .map(readSlot)
        .find((slot) => slot[0] !== 0);
      assert(bytes != null, "No slot maps a path");
      return bytes;
    },
  };
};

/** A free slot: an all-zero header and nothing after it. */
export const freeSlotBytes = (): Uint8Array<ArrayBuffer> =>
  new Uint8Array(sahPoolHeaderSize);
