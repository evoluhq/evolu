/**
 * `SahPool` and its VFS on the pinned binary, over a fake OPFS.
 *
 * Covers the opfs-sahpool tests of SQLite's `ext/wasm/tester1.c-pp.js` and
 * `sahpool-pausing.js` (public domain) that apply in Node.js, cited by group
 * and test, the scenarios of wa-sqlite's `vfs_*` tests (MIT, Copyright (c) 2023
 * Roy T. Hashimoto) at fa11129, re-expressed and cited by file, and Evolu's own
 * tests of the module documentation.
 */

import {
  assert,
  assertEqual,
  assertErr,
  testCreateRun,
  assertInstanceOf,
  assertOk,
  assertSame,
  assertThrows,
  assertTrue,
  getOrThrow,
  Millis,
  testCreateDeps,
  testCreateTime,
  type NonNegativeInt,
  type PanicAbortReason,
  type RandomBytes,
  type TestTime,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_exec,
  sqlite3_extended_errcode,
  sqlite3_free,
  sqlite3_get_autocommit,
  sqlite3_malloc,
  sqlite3_vfs_find,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  sqlite3_file_layout,
  sqlite3_io_methods_layout,
  sqlite3_vfs_layout,
  SQLITE_ACCESS_READWRITE,
  SQLITE_CANTOPEN,
  SQLITE_FCNTL_LOCKSTATE,
  SQLITE_FCNTL_PRAGMA,
  SQLITE_FCNTL_SIZE_HINT,
  SQLITE_FULL,
  SQLITE_IOERR,
  SQLITE_IOERR_DELETE,
  SQLITE_IOERR_DIR_FSYNC,
  SQLITE_IOERR_FSTAT,
  SQLITE_IOERR_FSYNC,
  SQLITE_IOERR_READ,
  SQLITE_IOERR_SHORT_READ,
  SQLITE_IOERR_TRUNCATE,
  SQLITE_IOERR_WRITE,
  SQLITE_NOMEM,
  SQLITE_NOTFOUND,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_DELETEONCLOSE,
  SQLITE_OPEN_EXCLUSIVE,
  SQLITE_OPEN_MAIN_DB,
  SQLITE_OPEN_MAIN_JOURNAL,
  SQLITE_OPEN_READWRITE,
  SQLITE_OPEN_READONLY,
  SQLITE_OPEN_SUPER_JOURNAL,
  SQLITE_OPEN_TEMP_DB,
  SQLITE_OPEN_URI,
  SQLITE_OPEN_WAL,
  SQLITE_READONLY,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  allocWasm,
  copyWasmBytes,
  writeWasmBytes,
} from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type { SqliteShortWriteError } from "../../../../packages/sqlite-wasm/src/Database.ts";
import type {
  CStringPtr,
  SqliteFilePtr,
  SqliteOwnedPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  computeSahPoolDigest,
  OpfsName,
  sahPoolDigestV2Flag,
  sahPoolHeaderCorpusSize,
  sahPoolHeaderPathSize,
  sahPoolHeaderSize,
  type OpfsDirectoryHandle,
  type OpfsRoot,
} from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import { freeSlotBytes, setupSahPool, type TestSahPool } from "./_sahPool.ts";
import {
  createQuotaExceededError,
  setupFakeOpfs,
  type FakeOpfsFault,
  type FakeOpfsFaultHook,
} from "./_fakeOpfs.ts";
import { setupDatabase } from "./_sqliteWasm.ts";
import { openSahPool } from "../../../../packages/sqlite-wasm/src/SahPool.ts";

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: the VFS is
// registered by installing the pool, which starts with its default capacity.
test("openSahPool on an empty OPFS creates the directory with .opaque and 6 free slots, each 4096 zero bytes, and registers its VFS", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".evolu")] });
  const other = await setupDatabase();

  assertEqual(t.pool.vfsName, "opfs-sahpool:.evolu");
  assertTrue(t.fake.hasDirectory(".evolu/.opaque"));
  assertEqual(t.slotNames().length, 6);
  for (const fileName of t.slotNames())
    assertEqual(t.readSlot(fileName), freeSlotBytes());
  assertTrue(t.findVfs() !== 0);
  assertEqual(sqlite3_vfs_find(other)(other.cString(t.pool.vfsName)), 0);
  // opfs-sahpool's HEADER_MAX_PATH_SIZE.
  assertEqual(
    t.readPtr(
      (t.findVfs() + sqlite3_vfs_layout.members.mxPathname.offset) as WasmPtr,
    ),
    sahPoolHeaderPathSize,
  );
  // Registered as no default, so Memory databases never open on the pool.
  assertEqual(
    t.text(
      t.readPtr(
        (sqlite3_vfs_find(t)(0) +
          sqlite3_vfs_layout.members.zName.offset) as WasmPtr,
      ) as CStringPtr,
    ),
    "evolu-memory",
  );
});

// wa-sqlite test/vfs_xOpen.js 'should create a file'.
test("xOpen with CREATE maps the normalized path to a free slot and returns the flags, and xAccess then finds it", async () => {
  const t = await setupSahPool();
  const flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE;
  const pResOut = getOrThrow(allocWasm(t)(4));

  const { rc, outFlags } = t.openFile("test", flags);

  assertEqual([rc, outFlags], [SQLITE_OK, flags]);
  assertEqual(t.pool.getPaths(), ["/test"]);
  assertEqual(
    t.callVfs("xAccess", t.cString("test"), SQLITE_ACCESS_READWRITE, pResOut),
    SQLITE_OK,
  );
  assertEqual(t.readPtr(pResOut), 1);
});

/**
 * The bytes of a slot whose header maps a path, as opfs-sahpool writes them:
 * the UTF-8 path, NUL-padded to 512 bytes, the flags as a big-endian u32, and
 * the digest's two u32 values as they are in memory, little-endian here.
 */
const createSlotBytes = (
  path: string,
  flags: number,
  byteLength: number = sahPoolHeaderSize,
): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(byteLength);
  new TextEncoder().encodeInto(path, bytes);
  new DataView(bytes.buffer).setUint32(512, flags);
  bytes.set(
    new Uint8Array(
      computeSahPoolDigest(bytes.subarray(0, sahPoolHeaderCorpusSize), flags)
        .buffer,
    ),
    sahPoolHeaderCorpusSize,
  );
  return bytes;
};

// SQLite passes NULL for the output flags when it opens a journal.
test("xOpen writes no output flags when SQLite passes NULL for them, directly or for a journal", async () => {
  const t = await setupSahPool();
  const sentinel = Uint8Array.of(0xaa, 0xbb, 0xcc, 0xdd);
  writeWasmBytes(t)(0 as WasmPtr, sentinel);
  const pFile = getOrThrow(allocWasm(t)(sqlite3_file_layout.sizeof));

  assertEqual(
    t.callVfs(
      "xOpen",
      t.cString("/direct\0"),
      pFile,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
      0,
    ),
    SQLITE_OK,
  );
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );

  assertEqual(copyWasmBytes(t)(0 as WasmPtr, 4), sentinel);
  assertEqual(t.pool.getPaths(), ["/direct", "/test.db"]);
  assertEqual(t.callIo(pFile as WasmPtr as SqliteFilePtr, "xClose"), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// wa-sqlite test/vfs_xOpen.js 'should create a database file', with the
// on-disk format of SQLite's opfs-sahpool.
test("xOpen with CREATE writes the slot's header byte for byte as opfs-sahpool does, with the digest-v2 flag", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;

  const { rc, outFlags } = t.openFile("test", flags);

  assertEqual([rc, outFlags], [SQLITE_OK, flags]);
  assertEqual(
    t.readMappedSlot(),
    createSlotBytes("/test", flags | sahPoolDigestV2Flag),
  );
});

// wa-sqlite test/vfs_xOpen.js 'should not create a file'.
test("xOpen without CREATE fails with SQLITE_CANTOPEN for a missing file, leaving pMethods NULL and the pool unchanged", async () => {
  const t = await setupSahPool();
  const pResOut = getOrThrow(allocWasm(t)(4));
  const slots = t.slotNames().map(t.readSlot);

  const { rc, pFile } = t.openFile("test", SQLITE_OPEN_READWRITE);

  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(t.pool.getPaths(), []);
  assertEqual(t.slotNames().map(t.readSlot), slots);
  assertEqual(
    t.callVfs("xAccess", t.cString("test"), SQLITE_ACCESS_READWRITE, pResOut),
    SQLITE_OK,
  );
  assertEqual(t.readPtr(pResOut), 0);
});

// wa-sqlite test/vfs_xOpen.js 'should open an existing file'.
test("xOpen opens an existing file without CREATE after xClose closed it", async () => {
  const t = await setupSahPool();
  const created = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  assertEqual(t.callIo(created.pFile, "xClose"), SQLITE_OK);

  const { rc, outFlags } = t.openFile("test", SQLITE_OPEN_READWRITE);

  assertEqual([rc, outFlags], [SQLITE_OK, SQLITE_OPEN_READWRITE]);
  assertEqual(t.pool.getPaths(), ["/test"]);
});

// wa-sqlite test/vfs_xWrite.js 'should round-trip data'.
test("xWrite stores data after the header, where xRead and SahPool.read find it", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const data = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
  const pData = getOrThrow(allocWasm(t)(data.length));
  writeWasmBytes(t)(pData, data);
  const pRead = getOrThrow(allocWasm(t)(data.length));

  assertEqual(t.callIo(pFile, "xWrite", pData, data.length, 0n), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xRead", pRead, data.length, 0n), SQLITE_OK);

  assertEqual(copyWasmBytes(t)(pRead, data.length), data);
  assertOk(
    t.pool.read("/test", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
  assertEqual(t.readMappedSlot().subarray(sahPoolHeaderSize), data);
});

// wa-sqlite test/vfs_xRead.js 'should signal short read'.
test("xRead past the end returns SQLITE_IOERR_SHORT_READ and zero-fills the rest of the buffer", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const data = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
  const pData = getOrThrow(allocWasm(t)(data.length));
  writeWasmBytes(t)(pData, data);
  assertEqual(t.callIo(pFile, "xWrite", pData, data.length, 0n), SQLITE_OK);
  const pRead = getOrThrow(allocWasm(t)(data.length * 2));
  writeWasmBytes(t)(pRead, new Uint8Array(data.length * 2).fill(0xfb));

  assertEqual(
    t.callIo(pFile, "xRead", pRead, data.length * 2, 0n),
    SQLITE_IOERR_SHORT_READ,
  );

  assertEqual(
    copyWasmBytes(t)(pRead, data.length * 2),
    Uint8Array.of(...data, ...new Uint8Array(data.length)),
  );
});

/**
 * Calls `xAccess` and returns what it reported, into memory set to -1 first, so
 * a method that writes nothing shows.
 */
const access = (t: TestSahPool, name: string): number => {
  const pResOut = getOrThrow(allocWasm(t)(4));
  t.sqliteWasm.getHeapDataView().setInt32(pResOut, -1, true);
  assertEqual(
    t.callVfs("xAccess", t.cString(name), SQLITE_ACCESS_READWRITE, pResOut),
    SQLITE_OK,
  );
  return t.readPtr(pResOut);
};

// wa-sqlite test/vfs_xClose.js 'should leave an accessible file'.
test("xClose leaves the file in the pool", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );

  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);

  assertEqual(access(t, "test"), 1);
  assertEqual(t.pool.getPaths(), ["/test"]);
});

// SQLite opens a file without a name only for a temporary file, which this
// build keeps in memory.
test("xOpen refuses a file without a name with SQLITE_CANTOPEN, leaving pMethods NULL and mapping no path", async () => {
  const t = await setupSahPool();

  const { rc, pFile } = t.openFile(
    null,
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_DELETEONCLOSE,
  );

  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(t.pool.getPaths(), []);
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks, pauseVfs: a
// paused VFS stays registered here, so opening the directory again reuses it.
test("disposing a pool closes every handle, so another context can take the files, and its VFS stays registered with xOpen failing with SQLITE_CANTOPEN", async () => {
  const t = await setupSahPool();
  const vfs = t.findVfs();

  t.pool[Symbol.dispose]();

  for (const fileName of t.slotNames())
    t.fake.hold(`${t.directoryPath}/.opaque/${fileName}`)();
  assertEqual(t.findVfs(), vfs);
  const { rc, pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(pFile), 0);
});

/** Writes bytes to an open file at an offset, through xWrite. */
const writeFile = (
  t: TestSahPool,
  pFile: SqliteFilePtr,
  data: Uint8Array,
  offset = 0,
): number => {
  const pData = getOrThrow(allocWasm(t)(data.length));
  writeWasmBytes(t)(pData, data);
  return t.callIo(pFile, "xWrite", pData, data.length, BigInt(offset));
};

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks, unpauseVfs, and
// sahpool-pausing.js: data written before pausing is there after.
test("opening the same directory again unpauses the VFS, which keeps its registration and finds the files it had", async () => {
  const t = await setupSahPool();
  const vfs = t.findVfs();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;
  const data = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
  const created = t.openFile("test", flags);
  assertEqual(writeFile(t, created.pFile, data), SQLITE_OK);
  assertEqual(t.callIo(created.pFile, "xClose"), SQLITE_OK);
  t.pool[Symbol.dispose]();

  const pool = getOrThrow(await t.openPool());

  assertEqual(pool.vfsName, t.pool.vfsName);
  assertEqual(t.findVfs(), vfs);
  assertEqual(t.slotNames().length, 6);
  assertEqual(pool.getPaths(), ["/test"]);
  assertOk(
    pool.read("/test", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
  const { rc, pFile } = t.openFile("test", SQLITE_OPEN_READWRITE);
  assertEqual(rc, SQLITE_OK);
  const pRead = getOrThrow(allocWasm(t)(data.length));
  assertEqual(t.callIo(pFile, "xRead", pRead, data.length, 0n), SQLITE_OK);
  assertEqual(copyWasmBytes(t)(pRead, data.length), data);
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: 'Cannot pause VFS
// with opened db.'
test("disposing a pool with an open file throws and changes nothing, and disposing it after the file closes pauses it", async () => {
  const t = await setupSahPool();
  const data = Uint8Array.of(1, 2, 3, 4);
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );

  assertThrows(
    () => {
      t.pool[Symbol.dispose]();
    },
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(
        thrown.message,
        "Cannot dispose a SahPool with an open file, because closing its handle would corrupt SQLite's state.",
      );
    },
  );

  assertEqual(writeFile(t, pFile, data), SQLITE_OK);
  assertOk(
    t.pool.read("/test", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  t.pool[Symbol.dispose]();
  assertEqual(t.openFile("test", SQLITE_OPEN_READWRITE).rc, SQLITE_CANTOPEN);
});

// digest-worker.js (digest.html): legacy [0, 0] digests stay valid and a bad
// digest frees the slot, and opfs-sahpool's getAssociatedPath for the rest.
test("setup keeps valid slots with a V2 or legacy digest, frees transient, DELETEONCLOSE and bad-digest slots, truncates free slots without rewriting them, and parses a short slot as zeros", async () => {
  const fake = setupFakeOpfs();
  const v2 = sahPoolDigestV2Flag;
  const rw = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE;
  const data = Uint8Array.of(1, 2, 3, 4);
  const withData = (bytes: Uint8Array) => Uint8Array.of(...bytes, ...data);
  // Each of the digest's two words is checked.
  const badDigest = createSlotBytes("/bad.db", SQLITE_OPEN_MAIN_DB | rw | v2);
  badDigest[sahPoolHeaderCorpusSize] ^= 1;
  const badDigest2 = createSlotBytes("/bad2.db", SQLITE_OPEN_MAIN_DB | rw | v2);
  badDigest2[sahPoolHeaderCorpusSize + 4] ^= 1;
  const slots = {
    database: withData(createSlotBytes("/a.db", SQLITE_OPEN_MAIN_DB | rw | v2)),
    // Written before SQLite 3.50, without the V2 flag.
    legacyJournal: withData(
      createSlotBytes("/a.db-journal", SQLITE_OPEN_MAIN_JOURNAL | rw),
    ),
    // Empty, so a buffer reused from the previous slot would parse as it.
    short: new Uint8Array(),
    temp: withData(createSlotBytes("/temp", SQLITE_OPEN_TEMP_DB | rw | v2)),
    deleteOnClose: withData(
      createSlotBytes(
        "/doc.db",
        SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_DELETEONCLOSE | rw | v2,
      ),
    ),
    badDigest: withData(badDigest),
    badDigest2: withData(badDigest2),
    longFree: withData(freeSlotBytes()),
  };
  for (const [fileName, bytes] of Object.entries(slots))
    fake.writeFile(`.evolu/.opaque/${fileName}`, bytes);

  const t = await setupSahPool({ fake });

  assertEqual(t.pool.getPaths().toSorted(), ["/a.db", "/a.db-journal"]);
  assertEqual(
    Object.fromEntries(t.slotNames().map((name) => [name, t.readSlot(name)])),
    {
      ...slots,
      short: freeSlotBytes(),
      temp: freeSlotBytes(),
      deleteOnClose: freeSlotBytes(),
      badDigest: freeSlotBytes(),
      badDigest2: freeSlotBytes(),
      longFree: freeSlotBytes(),
    },
  );
  assertOk(
    t.pool.read("/a.db", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
  // A valid free slot is only truncated.
  assertEqual(
    fake.calls.filter(
      ({ method, path }) =>
        (method === "write" || method === "flush") &&
        (path.endsWith("/short") || path.endsWith("/longFree")),
    ),
    [],
  );
});

// The default TextDecoder strips a leading byte order mark, which would map the
// slot to another path, such as one another slot maps.
test("setup maps a slot whose header's path starts with U+FEFF to that path, keeping the byte order mark, apart from the slot of the path without it", async () => {
  const fake = setupFakeOpfs();
  const flags =
    SQLITE_OPEN_MAIN_DB |
    SQLITE_OPEN_READWRITE |
    SQLITE_OPEN_CREATE |
    sahPoolDigestV2Flag;
  fake.writeFile(".evolu/.opaque/bom", createSlotBytes("﻿/a.db", flags));
  fake.writeFile(".evolu/.opaque/plain", createSlotBytes("/a.db", flags));

  const t = await setupSahPool({ fake });

  assertEqual(t.pool.getPaths(), ["﻿/a.db", "/a.db"]);
});

/**
 * Creates a pool with a database file holding data, then disposes it, so a test
 * can open the directory again.
 */
const setupPausedPool = async (
  options: Parameters<typeof setupSahPool>[0] = {},
) => {
  const t = await setupSahPool(options);
  const data = Uint8Array.of(1, 2, 3, 4);
  const { pFile } = t.openFile(
    "test.db",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
  );
  assertEqual(writeFile(t, pFile, data), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  t.pool[Symbol.dispose]();
  const slotPath = (fileName: string) =>
    `${t.directoryPath}/.opaque/${fileName}`;
  const snapshot = () => t.slotNames().map(t.readSlot);
  return { ...t, data, slotPath, snapshot };
};

// wa-sqlite test/vfs_handle_recovery.js and vfs_open_last_error.js: an open
// fails while another context holds a file, records the cause, and succeeds
// once it is released.
test("openSahPool fails with SahPoolHeldError while another context holds a slot, having written nothing and closed what it acquired, and a retry succeeds once the slot is released", async () => {
  const t = await setupPausedPool();
  const held = t.slotNames()[3];
  const release = t.fake.hold(t.slotPath(held));
  const before = t.snapshot();
  const calls = t.fake.calls.length;

  const result = await t.openPool();

  assertErr(result);
  assert(result.error.type === "SahPoolHeldError", "Expected Held");
  assertEqual(result.error.fileName, held);
  assertInstanceOf(result.error.cause, DOMException);
  assertEqual(result.error.cause.name, "NoModificationAllowedError");
  assertEqual(t.snapshot(), before);
  assertEqual(
    t.fake.calls
      .slice(calls)
      .filter(({ method }) =>
        ["read", "write", "truncate", "flush"].includes(method),
      ),
    [],
  );
  // Every handle it acquired is closed again.
  for (const fileName of t.slotNames())
    if (fileName !== held) t.fake.hold(t.slotPath(fileName))();
  release();
  const pool = getOrThrow(await t.openPool());
  assertEqual(pool.getPaths(), ["/test.db"]);
  assertOk(
    pool.read("/test.db", 0 as NonNegativeInt, t.data.length as NonNegativeInt),
    t.data,
  );
});

test("openSahPool fails with SahPoolHeldError for WebKit's InvalidStateError too", async () => {
  const t = await setupPausedPool({
    fake: setupFakeOpfs({ heldErrorName: "InvalidStateError" }),
  });
  const held = t.slotNames()[0];
  t.fake.hold(t.slotPath(held));

  const result = await t.openPool();

  assertErr(result);
  assert(result.error.type === "SahPoolHeldError", "Expected Held");
  assertEqual(result.error.fileName, held);
  assertInstanceOf(result.error.cause, DOMException);
  assertEqual(result.error.cause.name, "InvalidStateError");
});

test("openSahPool fails with SahPoolHeldError when one slot is held and another fails otherwise, whichever OPFS lists first", async () => {
  for (const heldIndex of [1, 3]) {
    const t = await setupPausedPool();
    const held = t.slotNames()[heldIndex];
    const failing = t.slotNames()[2];
    t.fake.hold(t.slotPath(held));
    const error = new DOMException("Failed.", "UnknownError");
    t.fake.inject((call) =>
      call.method === "createSyncAccessHandle" &&
      call.path === t.slotPath(failing)
        ? { type: "Throw", error }
        : null,
    );

    const result = await t.openPool();

    assertErr(result);
    assert(result.error.type === "SahPoolHeldError", "Expected Held");
    assertEqual(result.error.fileName, held);
    assertInstanceOf(result.error.cause, DOMException);
    assertEqual(result.error.cause.name, "NoModificationAllowedError");
  }
});

// wa-sqlite's sweep: parallel acquisition leaked the handles that resolved
// after one rejected.
test("openSahPool waits for every acquisition and closes the handles that resolve after one rejected, reading and writing nothing", async () => {
  const t = await setupPausedPool();
  const rejection = Promise.withResolvers<void>();
  const resolution = Promise.withResolvers<void>();
  let acquisitions = 0;
  t.fake.inject((call) => {
    if (call.method !== "createSyncAccessHandle") return null;
    acquisitions++;
    return acquisitions === 3
      ? {
          type: "Delay",
          until: rejection.promise,
          next: {
            type: "Throw",
            error: new DOMException("Held.", "NoModificationAllowedError"),
          },
        }
      : { type: "Delay", until: resolution.promise, next: null };
  });
  const calls = t.fake.calls.length;

  const opening = t.openPool();
  rejection.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  resolution.resolve();
  const result = await opening;

  assertErr(result);
  assertEqual(result.error.type, "SahPoolHeldError");
  assertEqual(
    t.fake.calls
      .slice(calls)
      .filter(({ method }) =>
        ["read", "write", "truncate", "flush"].includes(method),
      ),
    [],
  );
  for (const fileName of t.slotNames()) t.fake.hold(t.slotPath(fileName))();
  t.fake.inject(null);
  assertOk(await t.openPool());
});

// Lets resolved promises settle before test time advances.
const flushMicrotasks = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/**
 * A paused pool with one slot held by another context, a test Run over its fake
 * OPFS whose time the test advances, and the times each attempt to open the
 * pool started, from when the setup returned. Each attempt's `getDirectory`
 * call does what `onAttempt` returns, given the attempt's number from 1.
 */
const setupHeldPool = async (
  onAttempt: (attempt: number, time: TestTime) => FakeOpfsFault | null = () =>
    null,
) => {
  const t = await setupPausedPool();
  const held = t.slotNames()[3];
  const release = t.fake.hold(t.slotPath(held));
  const run = testCreateRun({ ...t, opfsRoot: t.fake.opfsRoot });
  const start = run.deps.time.performance.now();
  const attemptTimes: Array<number> = [];
  t.fake.inject((call) => {
    if (call.method !== "getDirectory") return null;
    attemptTimes.push(run.deps.time.performance.now() - start);
    return onAttempt(attemptTimes.length, run.deps.time);
  });
  return { ...t, held, release, run, attemptTimes };
};

test("openSahPool with heldTimeout opens the pool again while another context holds a slot, 50 ms after the first attempt, then after twice the previous delay, until it is released, holding no slot in between", async () => {
  const t = await setupHeldPool();
  await using run = t.run;

  const opening = run(
    openSahPool({ directory: t.directory, heldTimeout: "10s" }),
  );
  await flushMicrotasks();
  run.deps.time.advance("49ms");
  await flushMicrotasks();
  assertEqual(t.attemptTimes, [0]);
  for (const fileName of t.slotNames())
    if (fileName !== t.held) t.fake.hold(t.slotPath(fileName))();
  run.deps.time.advance("1ms");
  await flushMicrotasks();
  run.deps.time.advance("99ms");
  await flushMicrotasks();
  assertEqual(t.attemptTimes, [0, 50]);
  t.release();
  run.deps.time.advance("1ms");
  using pool = getOrThrow(await opening);

  assertEqual(t.attemptTimes, [0, 50, 150]);
  assertEqual(pool.getPaths(), ["/test.db"]);
  assertOk(
    pool.read("/test.db", 0 as NonNegativeInt, t.data.length as NonNegativeInt),
    t.data,
  );
});

test("openSahPool with heldTimeout fails with SahPoolHeldError at the first attempt that ends the timeout or later after the first attempt started, retrying at most a second apart, and closes what it acquired", async () => {
  // The first attempt takes 1100 ms, which counts toward the timeout.
  const t = await setupHeldPool((attempt, time) => {
    if (attempt === 1) time.advance(Millis.orThrow(1100));
    return null;
  });
  await using run = t.run;

  const opening = run(
    openSahPool({ directory: t.directory, heldTimeout: "10s" }),
  );
  // Time advances 50 ms at a time for 20 seconds.
  for (let step = 0; step < 400; step += 1) {
    await flushMicrotasks();
    run.deps.time.advance("50ms");
  }
  const result = await opening;

  assertErr(result);
  assert(result.error.type === "SahPoolHeldError", "Expected Held");
  assertEqual(result.error.fileName, t.held);
  // The delay doubles from 50 ms up to a second after the first attempt ends,
  // and the attempt at 9650 ms is the last that starts within 10 seconds.
  assertEqual(
    t.attemptTimes,
    [
      0, 1150, 1250, 1450, 1850, 2650, 3650, 4650, 5650, 6650, 7650, 8650, 9650,
      10650,
    ],
  );
  // Every handle it acquired is closed again, and its claim is released.
  for (const fileName of t.slotNames())
    if (fileName !== t.held) t.fake.hold(t.slotPath(fileName))();
  t.release();
  using _pool = getOrThrow(await t.openPool());
});

test("openSahPool with heldTimeout fails at the attempt that starts exactly the timeout after the first one", async () => {
  const t = await setupHeldPool();
  await using run = t.run;

  const opening = run(
    openSahPool({ directory: t.directory, heldTimeout: "50ms" }),
  );
  for (let step = 0; step < 10; step += 1) {
    await flushMicrotasks();
    run.deps.time.advance("50ms");
  }

  const result = await opening;

  assertErr(result);
  assertEqual(result.error.type, "SahPoolHeldError");
  assertEqual(t.attemptTimes, [0, 50]);
});

test("openSahPool with heldTimeout fails at once with SahPoolSetupError when an attempt fails otherwise than held", async () => {
  const error = new DOMException("Refused.", "UnknownError");
  const t = await setupHeldPool((attempt) =>
    attempt === 2 ? { type: "Throw", error } : null,
  );
  await using run = t.run;

  const opening = run(
    openSahPool({ directory: t.directory, heldTimeout: "10s" }),
  );
  for (let step = 0; step < 40; step += 1) {
    await flushMicrotasks();
    run.deps.time.advance("50ms");
  }

  assertErr(await opening, { type: "SahPoolSetupError", cause: error });
  assertEqual(t.attemptTimes, [0, 50]);
});

test("openSahPool creates only .opaque in the pool directory and opens no file outside it", async () => {
  const t = await setupSahPool();

  assertEqual(t.fake.listFiles(".evolu"), []);
  assertTrue(t.fake.hasDirectory(".evolu/.opaque"));
  assertEqual(
    t.fake.calls.filter(
      ({ method, path }) =>
        (method === "getFileHandle" || method === "createSyncAccessHandle") &&
        !path.startsWith(".evolu/.opaque/"),
    ),
    [],
  );
});

test("openSahPool fails with SahPoolAlreadyOpenError for a directory the instance is waiting for", async () => {
  const t = await setupHeldPool();
  await using run = t.run;

  const waiting = run(
    openSahPool({ directory: t.directory, heldTimeout: "10s" }),
  );
  await flushMicrotasks();

  assertErr(await run(openSahPool({ directory: t.directory })), {
    type: "SahPoolAlreadyOpenError",
    directory: t.directory,
  });
  t.release();
  run.deps.time.advance("50ms");
  using _pool = getOrThrow(await waiting);
});

test("aborting openSahPool while it waits for a held slot releases its claim, leaving no handle open", async () => {
  const t = await setupHeldPool();
  await using run = t.run;

  const waiting = run.abortable(
    openSahPool({ directory: t.directory, heldTimeout: "10s" }),
  );
  await flushMicrotasks();
  waiting.abort();
  const result = await waiting;

  assertErr(result);
  assertEqual(result.error.type, "AbortError");
  for (const fileName of t.slotNames())
    if (fileName !== t.held) t.fake.hold(t.slotPath(fileName))();
  t.release();
  using _pool = getOrThrow(await t.openPool());
});

test("openSahPool fails with SahPoolSetupError, not the retryable SahPoolHeldError, when OPFS is unavailable or refuses a slot for another reason, and releases its claim on the directory", async () => {
  for (const [method, name, path] of [
    // Safari Private Browsing and Playwright's ephemeral WebKit.
    ["getDirectory", "UnknownError", ""],
    ["createSyncAccessHandle", "SecurityError", "/.opaque/"],
    ["createSyncAccessHandle", "NotSupportedError", "/.opaque/"],
    ["createSyncAccessHandle", "UnknownError", "/.opaque/"],
  ] as const) {
    const t = await setupPausedPool();
    const error = new DOMException("Refused.", name);
    t.fake.inject((call) =>
      call.method === method && call.path.includes(path)
        ? { type: "Throw", error }
        : null,
    );

    const result = await t.openPool();

    assertErr(result, { type: "SahPoolSetupError", cause: error });
    t.fake.inject(null);
    for (const fileName of t.slotNames()) t.fake.hold(t.slotPath(fileName))();
    // The failed open released its claim on the directory.
    assertOk(await t.openPool());
  }
});

// Chromium and Firefox expose createSyncAccessHandle only to dedicated
// workers, as the spec does, so calling it in a SharedWorker throws a
// TypeError before any promise exists.
test("openSahPool fails with SahPoolSetupError when createSyncAccessHandle throws synchronously, as in a SharedWorker, leaving the slots as they were and releasing its claim on the directory", async () => {
  const t = await setupPausedPool();
  const before = t.snapshot();
  const error = new TypeError("file.createSyncAccessHandle is not a function");
  const throwing = () => {
    throw error;
  };
  const withoutHandles = (
    directory: OpfsDirectoryHandle,
  ): OpfsDirectoryHandle => ({
    kind: "directory",
    getDirectoryHandle: async (name, options) =>
      withoutHandles(await directory.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) => ({
      ...(await directory.getFileHandle(name, options)),
      createSyncAccessHandle: throwing,
    }),
    values: async function* () {
      for await (const entry of directory.values())
        yield entry.kind === "file"
          ? { ...entry, createSyncAccessHandle: throwing }
          : withoutHandles(entry);
    },
  });
  const opfsRoot: OpfsRoot = {
    getDirectory: async () =>
      withoutHandles(await t.fake.opfsRoot.getDirectory()),
  };
  await using run = testCreateRun({ ...t, opfsRoot });

  const result = await run(openSahPool({ directory: t.directory }));

  assertErr(result, { type: "SahPoolSetupError", cause: error });
  assertEqual(t.snapshot(), before);
  assertOk(await t.openPool());
});

// 2.2.4 removed the directory, database included, when setup failed.
test("a setup failure after acquisition, reading a header or topping up, returns SahPoolSetupError, closes every handle and leaves the directory and its slots as they were", async () => {
  const error = new DOMException("Failed.", "UnknownError");
  for (const method of ["read", "truncate"] as const) {
    const t = await setupPausedPool();
    // Fewer slots than the capacity, so setup tops up.
    const removed = t.slotNames().at(-1);
    assertTrue(removed != null);
    const fake = setupFakeOpfs();
    for (const fileName of t.slotNames())
      if (fileName !== removed)
        fake.writeFile(t.slotPath(fileName), t.readSlot(fileName));
    const u = await setupSahPool({
      fake,
      directory: [OpfsName.orThrow(".other")],
    });
    const before = t.slotNames().filter((fileName) => fileName !== removed);
    fake.inject((call) =>
      call.method === method && call.path.startsWith(".evolu/")
        ? { type: "Throw", error }
        : null,
    );

    const result = await u.openPool([OpfsName.orThrow(".evolu")]);

    assertErr(result, { type: "SahPoolSetupError", cause: error });
    fake.inject(null);
    assertTrue(fake.hasDirectory(".evolu/.opaque"));
    for (const fileName of before)
      assertEqual(fake.readFile(t.slotPath(fileName)), t.readSlot(fileName));
    for (const fileName of fake.listFiles(".evolu/.opaque"))
      fake.hold(t.slotPath(fileName))();
    // The failed open released its claim on the directory.
    assertOk(await u.openPool([OpfsName.orThrow(".evolu")]));
  }
});

test("xOpen normalizes names to URL paths, so file:evolu1.db, evolu1.db and /evolu1.db are one file, and rejects a path of 511 or more UTF-8 bytes, recording SahPoolInvalidPath", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;

  for (const name of [
    "file:evolu1.db",
    "evolu1.db",
    "/evolu1.db",
    "./a/../evolu1.db",
  ])
    assertEqual(t.openFile(name, flags).rc, SQLITE_OK);
  assertEqual(t.openFile("evolu1.db-journal", flags).rc, SQLITE_OK);
  // As URL paths, which opfs-sahpool stores too, percent-encoded.
  assertEqual(t.openFile("é.db", flags).rc, SQLITE_OK);
  // A journal, because a database's journal path must fit too.
  const journalFlags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  const longest = `/${"a".repeat(509)}`;
  assertEqual(t.openFile(longest, journalFlags).rc, SQLITE_OK);
  t.pool.clearFailure();
  assertEqual(t.openFile(`${longest}a`, journalFlags).rc, SQLITE_CANTOPEN);
  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: `${longest}a`,
    error: { type: "SahPoolInvalidPath", name: `${longest}a` },
  });

  assertEqual(t.pool.getPaths(), [
    "/evolu1.db",
    "/evolu1.db-journal",
    "/%C3%A9.db",
    longest,
  ]);
  const headers = t
    .slotNames()
    .map(t.readSlot)
    .filter((bytes) => bytes[0] !== 0)
    .map((bytes) =>
      new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0))),
    );
  assertEqual(headers.toSorted(), t.pool.getPaths().toSorted());
});

// SQLite names a database's journal by appending -journal, 8 bytes, to its
// path, and its super-journal, for a transaction that writes attached
// databases too, by appending -mjXXXXXX9XX, 12 bytes, and the pool normalizes
// the path.
test("xOpen rejects a database whose path, normalized, is 499 or more UTF-8 bytes, so its super-journal's path would not fit a header, with SQLITE_CANTOPEN, recording SahPoolInvalidPath and taking no slot, and a database of 498 bytes commits a transaction that writes an attached database", async () => {
  const t = await setupSahPool();
  const longest = `/${"a".repeat(497)}`;
  const opened = t.openDatabase(longest);
  assertEqual(opened.rc, SQLITE_OK);
  assertEqual(
    t.exec(
      "CREATE TABLE t(a); ATTACH '/b.db' AS b; CREATE TABLE b.u(a); BEGIN; INSERT INTO t VALUES (1); INSERT INTO b.u VALUES (1); COMMIT",
      opened.db,
    ),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(opened.db), SQLITE_OK);

  // The last name is 167 bytes, a path of 499 bytes percent-encoded.
  for (const name of [`${longest}a`, `${longest}aa`, `/${"é".repeat(83)}`]) {
    t.pool.clearFailure();
    const { rc, db } = t.openDatabase(name);

    assertEqual(rc, SQLITE_CANTOPEN);
    assertEqual(t.pool.getFailure(), {
      method: "xOpen",
      path: new URL(name, "file://localhost/").pathname,
      error: { type: "SahPoolInvalidPath", name },
    });
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  }
  assertEqual(t.pool.getPaths().toSorted(), [longest, "/b.db"]);
});

// SQLite creates a super-journal with SQLITE_OPEN_EXCLUSIVE, as unix opens it
// with O_EXCL. opfs-sahpool on trunk refuses it too.
test("xOpen with SQLITE_OPEN_EXCLUSIVE fails with SQLITE_CANTOPEN when the file exists, and creates a file that does not", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE |
    SQLITE_OPEN_READWRITE |
    SQLITE_OPEN_EXCLUSIVE |
    SQLITE_OPEN_SUPER_JOURNAL;
  const created = t.openFile("/a.db-mj01", flags);
  assertEqual(created.rc, SQLITE_OK);
  assertEqual(t.callIo(created.pFile, "xClose"), SQLITE_OK);

  const existing = t.openFile("/a.db-mj01", flags);

  assertEqual(existing.rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(existing.pFile), 0);
  assertEqual(t.pool.getPaths(), ["/a.db-mj01"]);
});

// Engines parse the host of a file URL differently: Chromium keeps localhost
// and Firefox discards any host. So a host is ignored, as in opfs-sahpool, and
// only a name whose suffix would land in it is rejected.
test("xOpen ignores a host followed by a path, so //evolu.db/x.db and file://localhost/x.db are /x.db", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;

  for (const name of ["//evolu.db/x.db", "file://localhost/x.db", "/x.db"])
    assertEqual(t.openFile(name, flags).rc, SQLITE_OK);

  assertEqual(t.pool.getPaths(), ["/x.db"]);
});

test("xFullPathname copies the name as SQLite passes it, and fails with SQLITE_CANTOPEN when it does not fit with its NUL", async () => {
  const t = await setupSahPool();
  const name = "file.db";
  const pOut = getOrThrow(allocWasm(t)(512));

  assertEqual(
    t.callVfs("xFullPathname", t.cString(name), 512, pOut),
    SQLITE_OK,
  );
  assertEqual(t.text(pOut as WasmPtr as CStringPtr), name);
  assertEqual(
    t.callVfs("xFullPathname", t.cString(name), name.length, pOut),
    SQLITE_CANTOPEN,
  );
});

test("xRandomness fills memory from RandomBytes in chunks of at most 65536 bytes, as crypto.getRandomValues requires, and returns the byte count", async () => {
  const lengths: Array<number> = [];
  const randomBytes = {
    create: (length: number) => {
      if (length > 65536)
        throw new RangeError("getRandomValues takes at most 65536 bytes.");
      lengths.push(length);
      return new Uint8Array(length).fill(7);
    },
  } as RandomBytes;
  const t = await setupSahPool({ deps: { ...testCreateDeps(), randomBytes } });
  for (const byteLength of [16, 2 * 65536 + 17]) {
    // With a guard byte after the buffer.
    const pOut = getOrThrow(allocWasm(t)(byteLength + 1));
    t.sqliteWasm.getHeapU8()[pOut + byteLength] = 0xa5;
    const expected = new Uint8Array(byteLength + 1).fill(7);
    expected[byteLength] = 0xa5;
    lengths.length = 0;

    assertEqual(t.callVfs("xRandomness", byteLength, pOut), byteLength);

    assertEqual(copyWasmBytes(t)(pOut, byteLength + 1), expected);
    assertEqual(lengths, byteLength === 16 ? [16] : [65536, 65536, 17]);
  }
});

test("xSleep returns at once, having slept 0 microseconds", async () => {
  const t = await setupSahPool();

  assertEqual(t.callVfs("xSleep", 1_000_000), 0);
});

test("xCurrentTime and xCurrentTimeInt64 read Time as a Julian day and as milliseconds since the Julian day epoch", async () => {
  const time = testCreateTime({ startAt: Millis.orThrow(1_790_000_000_000) });
  const t = await setupSahPool({ deps: { ...testCreateDeps(), time } });
  const pOut = getOrThrow(allocWasm(t)(8));

  assertEqual(t.callVfs("xCurrentTime", pOut), SQLITE_OK);
  assertEqual(
    t.sqliteWasm.getHeapDataView().getFloat64(pOut, true),
    1_790_000_000_000 / 86_400_000 + 2_440_587.5,
  );
  assertEqual(t.callVfs("xCurrentTimeInt64", pOut), SQLITE_OK);
  assertEqual(
    t.sqliteWasm.getHeapDataView().getBigInt64(pOut, true),
    1_790_000_000_000n + 210_866_760_000_000n,
  );
});

// SQLite calls xGetLastError(pVfs, 0, NULL) after SQLITE_IOERR and
// SQLITE_CANTOPEN.
test("xGetLastError reports no system error, accepts nBuf 0 and a NULL buffer, and writes nothing", async () => {
  const t = await setupSahPool();
  const pOut = getOrThrow(allocWasm(t)(8));
  writeWasmBytes(t)(pOut, new Uint8Array(8).fill(0xff));

  assertEqual(t.callVfs("xGetLastError", 0, 0), 0);
  assertEqual(t.callVfs("xGetLastError", 8, pOut), 0);

  assertEqual(copyWasmBytes(t)(pOut, 8), new Uint8Array(8).fill(0xff));
});

test("xFileSize returns the size of the file's data, after the header", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const pSize = getOrThrow(allocWasm(t)(8));
  assertEqual(t.callIo(pFile, "xFileSize", pSize), SQLITE_OK);
  assertEqual(t.sqliteWasm.getHeapDataView().getBigInt64(pSize, true), 0n);

  assertEqual(writeFile(t, pFile, new Uint8Array(10), 5), SQLITE_OK);

  assertEqual(t.callIo(pFile, "xFileSize", pSize), SQLITE_OK);
  assertEqual(t.sqliteWasm.getHeapDataView().getBigInt64(pSize, true), 15n);
});

test("xTruncate sets the size of the file's data, after the header", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  assertEqual(
    writeFile(t, pFile, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)),
    SQLITE_OK,
  );

  assertEqual(t.callIo(pFile, "xTruncate", 3n), SQLITE_OK);

  assertOk(
    t.pool.read("/test", 0 as NonNegativeInt, 8 as NonNegativeInt),
    Uint8Array.of(1, 2, 3),
  );
  assertEqual(t.readMappedSlot().length, sahPoolHeaderSize + 3);
});

test("xSync flushes the file's handle", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const calls = t.fake.calls.length;

  assertEqual(t.callIo(pFile, "xSync", 2), SQLITE_OK);

  assertEqual(
    t.fake.calls.slice(calls).map(({ method }) => method),
    ["flush"],
  );
});

// As in opfs-sahpool, so SQLite handles every pragma itself.
test("xFileControl returns SQLITE_NOTFOUND for every opcode of a file the pool does not encrypt", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const pArg = getOrThrow(allocWasm(t)(16));

  for (const opcode of [
    SQLITE_FCNTL_LOCKSTATE,
    SQLITE_FCNTL_SIZE_HINT,
    SQLITE_FCNTL_PRAGMA,
    9999,
  ])
    assertEqual(t.callIo(pFile, "xFileControl", opcode, pArg), SQLITE_NOTFOUND);
});

test("xSectorSize returns 4096 and xDeviceCharacteristics 0", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );

  assertEqual(t.callIo(pFile, "xSectorSize"), 4096);
  assertEqual(t.callIo(pFile, "xDeviceCharacteristics"), 0);
});

test("xDelete writes and flushes the free header, which is the durable delete, before it forgets the path and truncates the slot, and succeeds for a missing path", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test-journal",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL,
  );
  assertEqual(writeFile(t, pFile, new Uint8Array(512).fill(1)), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  const calls = t.fake.calls.length;

  assertEqual(t.callVfs("xDelete", t.cString("test-journal"), 1), SQLITE_OK);

  assertEqual(
    t.fake.calls
      .slice(calls)
      .map((call) =>
        call.method === "write"
          ? [call.method, call.at]
          : call.method === "truncate"
            ? [call.method, call.size]
            : [call.method],
      ),
    [["write", 0], ["flush"], ["truncate", sahPoolHeaderSize]],
  );
  assertEqual(access(t, "test-journal"), 0);
  assertEqual(t.pool.getPaths(), []);
  for (const fileName of t.slotNames())
    assertEqual(t.readSlot(fileName), freeSlotBytes());
  assertEqual(t.callVfs("xDelete", t.cString("test-journal"), 1), SQLITE_OK);
});

test("a paused VFS finds no file and deletes none", async () => {
  const t = await setupPausedPool();

  assertEqual(access(t, "test.db"), 0);
  assertEqual(
    t.callVfs("xDelete", t.cString("test.db"), 1),
    SQLITE_IOERR_DELETE,
  );
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: a database on the
// pool, with one file, because the journal is deleted at each commit.
test("SQLite creates, writes and reads a database on the pool, whose journal is gone after each commit", async () => {
  const t = await setupSahPool();
  const { rc, db } = t.openDatabase("/foo.db");
  assertEqual(rc, SQLITE_OK);

  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  for (const value of [1, 2, 3]) {
    assertEqual(t.exec(`INSERT INTO t VALUES (${value})`, db), SQLITE_OK);
    assertEqual(t.pool.getPaths(), ["/foo.db"]);
    assertEqual(access(t, "/foo.db-journal"), 0);
  }

  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "1,2,3");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  assertEqual(t.pool.getPaths(), ["/foo.db"]);
});

// VFS shims such as SQLite's cksumvfs forward every slot without NULL checks,
// even the ones SQLite itself checks or skips, and a NULL or mistyped slot
// traps. Even through a shim, SQLite reaches the default VFS's xOpen only for a
// temporary file, which this build keeps in memory, or for a path its
// xFullPathname accepted, and it accepts none.
test("every VFS and I/O method slot up to the declared version is a function of the C arity, in the pool's VFS and the default VFS, except xDl*, which the build never calls, and the default VFS's xOpen, which SQLite never reaches", async () => {
  const t = await setupSahPool();
  const arity = (signature: string) => signature.length - "i()".length;
  const vfsSlots = Object.entries(sqlite3_vfs_layout.members).filter(([name]) =>
    name.startsWith("x"),
  );
  const ioSlots = Object.entries(sqlite3_io_methods_layout.members).filter(
    ([name]) => name.startsWith("x"),
  );
  // Version 1 ends with xGetLastError and version 2 adds xCurrentTimeInt64;
  // I/O methods version 1 ends with xDeviceCharacteristics.
  const vfsSlotsOfVersion2 = vfsSlots.slice(0, 13);
  const ioSlotsOfVersion1 = ioSlots.slice(0, 12);
  const slotsOf = (
    struct: number,
    slots: ReadonlyArray<
      readonly [string, { readonly offset: number; readonly signature: string }]
    >,
  ) =>
    slots.map(([name, { offset, signature }]) => {
      const pointer = t.readPtr((struct + offset) as WasmPtr);
      const fn: unknown = t.sqliteWasm.functionTable.get(pointer);
      return [
        name,
        pointer === 0
          ? 0
          : typeof fn === "function" && fn.length === arity(signature),
      ];
    });
  const expected = (
    slots: ReadonlyArray<readonly [string, unknown]>,
    nullSlots: ReadonlyArray<string> = [],
  ) =>
    slots.map(([name]) => [
      name,
      name.startsWith("xDl") || nullSlots.includes(name) ? 0 : true,
    ]);

  const pool = t.findVfs();
  const memory = t.findVfs("evolu-memory");
  const { pFile } = t.openFile(
    "file",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const ioMethods = t.readPtr(pFile);

  for (const [vfs, nullSlots] of [
    [pool, []],
    [memory, ["xOpen"]],
  ] as const) {
    assertTrue(vfs !== 0);
    assertEqual(
      t.readPtr((vfs + sqlite3_vfs_layout.members.iVersion.offset) as WasmPtr),
      2,
    );
    assertEqual(
      slotsOf(vfs, vfsSlotsOfVersion2),
      expected(vfsSlotsOfVersion2, nullSlots),
    );
  }
  assertEqual(
    t.readPtr(
      (ioMethods +
        sqlite3_io_methods_layout.members.iVersion.offset) as WasmPtr,
    ),
    1,
  );
  assertEqual(
    slotsOf(ioMethods, ioSlotsOfVersion1),
    expected(ioSlotsOfVersion1),
  );
});

// sqlite3_malloc can return memory that held other data.
test("the VFS block is zeroed before it is filled in, so pAppData, the xDl* slots and the I/O methods past version 1 are NULL in reused memory", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".other")] });
  const byteLength =
    sqlite3_vfs_layout.sizeof +
    sqlite3_io_methods_layout.sizeof +
    "opfs-sahpool:.evolu\0".length;
  const blocks = Array.from({ length: 8 }, () => {
    const pointer = sqlite3_malloc(t)(byteLength);
    assertTrue(pointer !== 0);
    t.sqliteWasm.getHeapU8().fill(0xff, pointer, pointer + byteLength);
    return pointer;
  });
  for (const pointer of blocks) sqlite3_free(t)(pointer);

  const pool = getOrThrow(await t.openPool([OpfsName.orThrow(".evolu")]));

  const vfs = t.findVfs(pool.vfsName);
  assertTrue(blocks.some((pointer) => pointer === vfs));
  const { members } = sqlite3_vfs_layout;
  for (const member of [
    "pAppData",
    "xDlOpen",
    "xDlError",
    "xDlSym",
    "xDlClose",
  ] as const)
    assertEqual(
      [member, t.readPtr((vfs + members[member].offset) as WasmPtr)],
      [member, 0],
    );
  const ioMethods = vfs + sqlite3_vfs_layout.sizeof;
  // I/O methods version 1 ends with xDeviceCharacteristics.
  for (const [member, { offset }] of Object.entries(
    sqlite3_io_methods_layout.members,
  )
    .filter(([name]) => name.startsWith("x"))
    .slice(12))
    assertEqual(
      [member, t.readPtr((ioMethods + offset) as WasmPtr)],
      [member, 0],
    );
});

// wa-sqlite's sweep: the VFS name must outlive the registration.
test("the VFS struct, the I/O methods and the name are allocated once and never freed, and reopening the directory reuses them", async () => {
  const t = await setupSahPool();
  const vfs = t.findVfs();
  const zName = t.readPtr(
    (vfs + sqlite3_vfs_layout.members.zName.offset) as WasmPtr,
  );
  const tableLength = t.sqliteWasm.functionTable.length;
  t.pool[Symbol.dispose]();

  const pointers: Array<SqliteOwnedPtr> = [];
  for (let index = 0; index < 10_000; index++) {
    const pointer = sqlite3_malloc(t)(1 + ((index * 37) % 4096));
    assertTrue(pointer !== 0);
    t.sqliteWasm.getHeapU8().fill(0xa5, pointer, pointer + 1);
    pointers.push(pointer);
    if (index % 3 === 0) sqlite3_free(t)(pointers.shift() ?? 0);
  }
  for (const pointer of pointers) sqlite3_free(t)(pointer);
  const pool = getOrThrow(await t.openPool());

  assertEqual(pool.vfsName, t.pool.vfsName);
  assertEqual(t.findVfs(), vfs);
  assertEqual(t.text(zName as CStringPtr), t.pool.vfsName);
  assertEqual(t.sqliteWasm.functionTable.length, tableLength);
  const { rc, db } = t.openDatabase("/test.db");
  assertEqual(rc, SQLITE_OK);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("a failing handle method makes its VFS method return its own extended code and record the failure", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const pBuffer = getOrThrow(allocWasm(t)(8));
  const error = new DOMException("Failed.", "InvalidStateError");

  for (const [method, call, rc] of [
    [
      "xRead",
      () => t.callIo(pFile, "xRead", pBuffer, 8, 0n),
      SQLITE_IOERR_READ,
    ],
    [
      "xWrite",
      () => t.callIo(pFile, "xWrite", pBuffer, 8, 0n),
      SQLITE_IOERR_WRITE,
    ],
    [
      "xTruncate",
      () => t.callIo(pFile, "xTruncate", 0n),
      SQLITE_IOERR_TRUNCATE,
    ],
    ["xSync", () => t.callIo(pFile, "xSync", 2), SQLITE_IOERR_FSYNC],
    [
      "xFileSize",
      () => t.callIo(pFile, "xFileSize", pBuffer),
      SQLITE_IOERR_FSTAT,
    ],
  ] as const) {
    const handleMethod = {
      xRead: "read",
      xWrite: "write",
      xTruncate: "truncate",
      xSync: "flush",
      xFileSize: "getSize",
    }[method];
    t.fake.inject((fakeCall) =>
      fakeCall.method === handleMethod ? { type: "Throw", error } : null,
    );
    t.pool.clearFailure();

    assertEqual(call(), rc);

    assertEqual(t.pool.getFailure(), { method, path: "/test", error });
    t.fake.inject(null);
  }
  assertEqual(t.reportDefect.getDefects(), []);
});

test("the pool records the first failure until clearFailure, and xGetLastError leaves it", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const pBuffer = getOrThrow(allocWasm(t)(8));
  const readError = new DOMException("Read failed.", "InvalidStateError");
  const syncError = new DOMException("Flush failed.", "InvalidStateError");
  t.fake.inject((call) =>
    call.method === "read"
      ? { type: "Throw", error: readError }
      : call.method === "flush"
        ? { type: "Throw", error: syncError }
        : null,
  );
  assertEqual(t.pool.getFailure(), null);

  assertEqual(t.callIo(pFile, "xRead", pBuffer, 8, 0n), SQLITE_IOERR_READ);
  assertEqual(t.callIo(pFile, "xSync", 2), SQLITE_IOERR_FSYNC);
  assertEqual(t.callVfs("xGetLastError", 0, 0), 0);

  assertEqual(t.pool.getFailure(), {
    method: "xRead",
    path: "/test",
    error: readError,
  });
  t.pool.clearFailure();
  assertEqual(t.pool.getFailure(), null);
  assertEqual(t.callIo(pFile, "xSync", 2), SQLITE_IOERR_FSYNC);
  assertEqual(t.pool.getFailure(), {
    method: "xSync",
    path: "/test",
    error: syncError,
  });
});

// The forum post on SQLITE_FULL: Chromium throws QuotaExceededError, now also
// as its own DOMException subclass, Firefox returns a short count, Chromium
// off the record returned 0xFFFFFFF8, and WebKit throws InvalidStateError for a
// full disk and for unrelated failures alike.
test("xWrite returns SQLITE_FULL for an error named QuotaExceededError or a count other than the length, recording a SqliteShortWriteError, and SQLITE_IOERR_WRITE for any other error", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  class QuotaExceededError extends DOMException {
    constructor() {
      super("The quota has been exceeded.", "QuotaExceededError");
    }
  }
  const plainQuotaError = Object.assign(new Error("Quota."), {
    name: "QuotaExceededError",
  });
  const invalidState = new DOMException("Failed.", "InvalidStateError");
  const domQuotaError = createQuotaExceededError();
  const subclassQuotaError = new QuotaExceededError();

  for (const [fault, rc, error] of [
    [{ type: "Throw", error: domQuotaError }, SQLITE_FULL, domQuotaError],
    [
      { type: "Throw", error: subclassQuotaError },
      SQLITE_FULL,
      subclassQuotaError,
    ],
    [{ type: "Throw", error: plainQuotaError }, SQLITE_FULL, plainQuotaError],
    [
      { type: "Count", count: 0 },
      SQLITE_FULL,
      {
        type: "SqliteShortWrite",
        requested: 8,
        written: 0,
      } satisfies SqliteShortWriteError,
    ],
    [
      { type: "Count", count: 3 },
      SQLITE_FULL,
      {
        type: "SqliteShortWrite",
        requested: 8,
        written: 3,
      } satisfies SqliteShortWriteError,
    ],
    [
      { type: "Count", count: 0xfffffff8 },
      SQLITE_FULL,
      {
        type: "SqliteShortWrite",
        requested: 8,
        written: 0xfffffff8,
      } satisfies SqliteShortWriteError,
    ],
    [{ type: "Throw", error: invalidState }, SQLITE_IOERR_WRITE, invalidState],
  ] satisfies ReadonlyArray<readonly [FakeOpfsFault, number, unknown]>) {
    t.fake.inject((call) => (call.method === "write" ? fault : null));
    t.pool.clearFailure();

    assertEqual(writeFile(t, pFile, new Uint8Array(8)), rc);

    assertEqual(t.pool.getFailure(), {
      method: "xWrite",
      path: "/test",
      error,
    });
  }
});

// Chromium throws QuotaExceededError from a shrinking truncate on a full APFS
// disk, which unixTruncate reports as SQLITE_IOERR_TRUNCATE.
test("xTruncate returns SQLITE_IOERR_TRUNCATE for QuotaExceededError too, not SQLITE_FULL", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "truncate" ? { type: "Throw", error } : null,
  );

  assertEqual(t.callIo(pFile, "xTruncate", 0n), SQLITE_IOERR_TRUNCATE);

  assertEqual(t.pool.getFailure(), {
    method: "xTruncate",
    path: "/test",
    error,
  });
});

test("xRead zero-fills the rest of a short read in the middle of a file too", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "test",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );
  assertEqual(writeFile(t, pFile, new Uint8Array(16).fill(1)), SQLITE_OK);
  const pRead = getOrThrow(allocWasm(t)(8));
  writeWasmBytes(t)(pRead, new Uint8Array(8).fill(0xfb));
  t.fake.inject((call) =>
    call.method === "read" ? { type: "Count", count: 3 } : null,
  );

  assertEqual(t.callIo(pFile, "xRead", pRead, 8, 4n), SQLITE_IOERR_SHORT_READ);

  assertEqual(
    copyWasmBytes(t)(pRead, 8),
    Uint8Array.of(1, 1, 1, 0, 0, 0, 0, 0),
  );
});

test("xOpen with CREATE fails with SQLITE_CANTOPEN when no slot is free, recording SahPoolFull, and works again once a file is deleted", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;
  const files = Array.from({ length: 6 }, (_, index) =>
    t.openFile(`/${index}`, flags),
  );
  for (const file of files) assertEqual(file.rc, SQLITE_OK);
  const slots = t.slotNames().map(t.readSlot);

  const { rc, pFile } = t.openFile("/6", flags);

  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: "/6",
    error: { type: "SahPoolFull", capacity: 6 },
  });
  assertEqual(t.slotNames().map(t.readSlot), slots);
  assertEqual(t.callIo(files[0].pFile, "xClose"), SQLITE_OK);
  assertEqual(t.callVfs("xDelete", t.cString("/0"), 0), SQLITE_OK);
  assertEqual(t.openFile("/6", flags).rc, SQLITE_OK);
});

test("xOpen with CREATE fails with SQLITE_FULL when writing the header throws QuotaExceededError or writes short, and with SQLITE_CANTOPEN for another error, leaving the slot free", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  const quotaError = createQuotaExceededError();
  const invalidState = new DOMException("Failed.", "InvalidStateError");

  for (const [fault, rc, error] of [
    [{ type: "Throw", error: quotaError }, SQLITE_FULL, quotaError],
    [
      { type: "Count", count: 3 },
      SQLITE_FULL,
      { type: "SqliteShortWrite", requested: 524, written: 3 },
    ],
    [{ type: "Throw", error: invalidState }, SQLITE_CANTOPEN, invalidState],
  ] satisfies ReadonlyArray<readonly [FakeOpfsFault, number, unknown]>) {
    let faulted = false;
    t.fake.inject((call) => {
      if (faulted || call.method !== "write" || call.at !== 0) return null;
      faulted = true;
      return fault;
    });
    t.pool.clearFailure();

    const opened = t.openFile("/test.db-journal", flags);

    assertEqual(opened.rc, rc);
    assertEqual(t.readPtr(opened.pFile), 0);
    assertEqual(t.pool.getFailure(), {
      method: "xOpen",
      path: "/test.db-journal",
      error,
    });
    assertEqual(t.pool.getPaths(), []);
  }
  t.fake.inject(null);
  for (let index = 0; index < 6; index++)
    assertEqual(t.openFile(`/${index}`, flags).rc, SQLITE_OK);
});

test("xOpen with CREATE fails with SQLITE_IOERR_FSYNC when flushing the free slot fails, writing no header and leaving the slot free", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  const error = new DOMException("Failed.", "InvalidStateError");
  t.fake.inject((call) =>
    call.method === "flush" ? { type: "Throw", error } : null,
  );
  const calls = t.fake.calls.length;

  const { rc, pFile } = t.openFile("/test.db-journal", flags);

  assertEqual(rc, SQLITE_IOERR_FSYNC);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: "/test.db-journal",
    error,
  });
  assertEqual(t.pool.getPaths(), []);
  assertEqual(access(t, "/test.db-journal"), 0);
  assertEqual(
    t.fake.calls.slice(calls).filter(({ method }) => method === "write"),
    [],
  );
  for (const fileName of t.slotNames())
    assertEqual(t.readSlot(fileName), freeSlotBytes());
  t.fake.inject(null);
  assertEqual(t.openFile("/test.db-journal", flags).rc, SQLITE_OK);
  assertEqual(t.pool.getPaths(), ["/test.db-journal"]);
});

// A delete whose flush failed still succeeds, so a new file in another slot
// must not reach the disk before that delete does.
test("xOpen with CREATE first flushes the free header of a delete whose flush failed, and fails with SQLITE_IOERR_FSYNC before writing a header when that flush fails again", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  for (const path of ["/a.db-journal", "/b.db-journal"]) {
    const { pFile } = t.openFile(path, flags);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  }
  const unflushedSlot = t.findSlotPath("/b.db-journal");
  assertEqual(t.callVfs("xDelete", t.cString("/a.db-journal"), 0), SQLITE_OK);
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "flush" && call.path === unflushedSlot
      ? { type: "Throw", error }
      : null,
  );
  assertEqual(t.callVfs("xDelete", t.cString("/b.db-journal"), 0), SQLITE_OK);
  const calls = t.fake.calls.length;

  // Takes the slot of /a.db-journal, listed first.
  const { rc, pFile } = t.openFile("/c.db-journal", flags);

  assertEqual(rc, SQLITE_IOERR_FSYNC);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: "/c.db-journal",
    error,
  });
  assertEqual(t.pool.getPaths(), []);
  assertEqual(
    t.fake.calls.slice(calls).filter(({ method }) => method === "write"),
    [],
  );
  t.fake.inject(null);
  const reopenCalls = t.fake.calls.length;
  assertEqual(t.openFile("/c.db-journal", flags).rc, SQLITE_OK);
  assertEqual(
    t.fake.calls
      .slice(reopenCalls)
      .filter(({ method }) => method === "flush" || method === "write")
      .map(({ method, path }) => [path === unflushedSlot, method]),
    [
      [true, "flush"],
      [false, "flush"],
      [false, "write"],
    ],
  );
  assertEqual(t.pool.getPaths(), ["/c.db-journal"]);
});

// A delete whose flush failed in another instance, whose worker died before
// flushing it again, looks like any free slot, so a pool cannot tell which free
// slot is not durable.
test("the first xOpen with CREATE flushes every slot free when the pool opened, and fails with SQLITE_IOERR_FSYNC before writing a header when one of those flushes fails, as a delete then does", async () => {
  const t = await setupPausedPool();
  const pool = getOrThrow(await t.openPool());
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  const databaseSlot = t.findSlotPath("/test.db");
  const freeSlots = t
    .slotNames()
    .map(t.slotPath)
    .filter((slotPath) => slotPath !== databaseSlot);
  // Listed last, so xOpen does not take it.
  const failingSlot = freeSlots[freeSlots.length - 1];
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "flush" && call.path === failingSlot
      ? { type: "Throw", error }
      : null,
  );
  const calls = t.fake.calls.length;

  const { rc, pFile } = t.openFile("/test.db-journal", flags);

  assertEqual(rc, SQLITE_IOERR_FSYNC);
  assertEqual(t.readPtr(pFile), 0);
  assertEqual(pool.getFailure(), {
    method: "xOpen",
    path: "/test.db-journal",
    error,
  });
  assertEqual(
    t.fake.calls
      .slice(calls)
      .filter(({ method }) => method === "flush" || method === "write")
      .map(({ method, path }) => [method, path]),
    freeSlots.map((slotPath) => ["flush", slotPath]),
  );
  assertEqual(
    t.callVfs("xDelete", t.cString("/test.db"), 0),
    SQLITE_IOERR_DELETE,
  );
  assertEqual(pool.getPaths(), ["/test.db"]);
  t.fake.inject(null);
  const retryCalls = t.fake.calls.length;
  assertEqual(t.openFile("/test.db-journal", flags).rc, SQLITE_OK);
  assertEqual(
    t.fake.calls
      .slice(retryCalls)
      .filter(({ method }) => method === "flush" || method === "write")
      .map(({ method, path }) => [method, path]),
    [
      ["flush", failingSlot],
      ["flush", freeSlots[0]],
      ["write", freeSlots[0]],
    ],
  );
  assertEqual(pool.getPaths(), ["/test.db", "/test.db-journal"]);
});

// On a full disk, the journal delete that commits a transaction can fail before
// it changes the free header, and the journal must then stay, so the failure
// SQLite reports matches the data. A write that changed a byte, or whose flush
// failed, deletes the file instead, as the next test shows.
test("xDelete fails with SQLITE_IOERR_DELETE when writing the free header fails before changing a byte, keeping the path mapped to its slot and its data", async () => {
  const quotaError = createQuotaExceededError();
  for (const [fault, error] of [
    [{ type: "Throw", error: quotaError }, quotaError],
    [
      { type: "Count", count: 0 },
      { type: "SqliteShortWrite", requested: 524, written: 0 },
    ],
    // Chromium off the record returns FILE_ERROR_NO_SPACE, -8, as the count
    // of a write it refused before copying a byte.
    [
      { type: "Count", count: 0xfffffff8 },
      { type: "SqliteShortWrite", requested: 524, written: 0xfffffff8 },
    ],
  ] satisfies ReadonlyArray<readonly [FakeOpfsFault, unknown]>) {
    const t = await setupSahPool();
    const flags =
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
    const data = new Uint8Array(512).fill(1);
    const { pFile } = t.openFile("/test.db-journal", flags);
    assertEqual(writeFile(t, pFile, data), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
    t.fake.inject((call) => (call.method === "write" ? fault : null));

    assertEqual(
      t.callVfs("xDelete", t.cString("/test.db-journal"), 1),
      SQLITE_IOERR_DELETE,
    );

    t.fake.inject(null);
    assertEqual(t.pool.getFailure(), {
      method: "xDelete",
      path: "/test.db-journal",
      error,
    });
    assertEqual(access(t, "/test.db-journal"), 1);
    assertEqual(t.pool.getPaths(), ["/test.db-journal"]);
    assertOk(
      t.pool.read(
        "/test.db-journal",
        0 as NonNegativeInt,
        data.length as NonNegativeInt,
      ),
      data,
    );
    // The next file takes another slot.
    for (let index = 0; index < 5; index++)
      assertEqual(t.openFile(`/${index}`, flags).rc, SQLITE_OK);
    assertEqual(t.openFile("/5", flags).rc, SQLITE_CANTOPEN);
  }
});

// A free header that the failed write or flush already changed names no path
// on disk, so failing would keep the path mapped to a file a reopened pool no
// longer has, and SQLite would roll back from it in the meantime.
test("xDelete succeeds once the free header's write changed a byte, although the write came up short or the flush failed, freeing and truncating the slot, so the path is gone in the pool and after a reopen", async () => {
  for (const [method, fault] of [
    ["write", { type: "Count", count: 1 }],
    ["flush", { type: "Throw", error: createQuotaExceededError() }],
  ] satisfies ReadonlyArray<readonly ["write" | "flush", FakeOpfsFault]>) {
    const t = await setupSahPool();
    const flags =
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
    const { pFile } = t.openFile("/test.db-journal", flags);
    assertEqual(writeFile(t, pFile, new Uint8Array(512).fill(1)), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
    const slot = t.findSlotPath("/test.db-journal");
    t.fake.inject((call) => (call.method === method ? fault : null));

    // Without asking for a durable delete, as SQLite deletes a journal in
    // synchronous = FULL. The next test asks for one.
    assertEqual(
      t.callVfs("xDelete", t.cString("/test.db-journal"), 0),
      SQLITE_OK,
    );

    t.fake.inject(null);
    assertEqual(t.pool.getFailure(), null);
    assertEqual(access(t, "/test.db-journal"), 0);
    assertEqual(t.pool.getPaths(), []);
    assertEqual(t.fake.readFile(slot)?.length, sahPoolHeaderSize);
    t.fake.releaseHandles();
    const reopened = await setupSahPool({
      directory: t.directory,
      fake: t.fake,
    });
    assertEqual(reopened.pool.getPaths(), []);
  }
});

// unixDelete fails with SQLITE_IOERR_DIR_FSYNC when syncing the directory after
// the unlink fails. SQLite asks for a durable delete for a journal in
// synchronous = EXTRA and for every super-journal.
test("xDelete asked for a durable delete flushes a free header whose flush failed again, and returns SQLITE_IOERR_DIR_FSYNC, recording the failure, when that flush fails too, with the path gone either way", async () => {
  const error = createQuotaExceededError();
  for (const [flushFailures, code, failure] of [
    [1, SQLITE_OK, null],
    [
      2,
      SQLITE_IOERR_DIR_FSYNC,
      { method: "xDelete", path: "/test.db-journal", error },
    ],
  ] as const) {
    const t = await setupSahPool();
    const flags =
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
    const { pFile } = t.openFile("/test.db-journal", flags);
    assertEqual(writeFile(t, pFile, new Uint8Array(512).fill(1)), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
    let failures = 0;
    t.fake.inject((call) =>
      call.method === "flush" && failures++ < flushFailures
        ? { type: "Throw", error }
        : null,
    );

    assertEqual(t.callVfs("xDelete", t.cString("/test.db-journal"), 1), code);

    t.fake.inject(null);
    assertEqual(failures, 2);
    assertEqual(t.pool.getFailure(), failure);
    assertEqual(access(t, "/test.db-journal"), 0);
    assertEqual(t.pool.getPaths(), []);
  }
});

/**
 * Creates a journal with data and deletes it while truncating fails, which
 * leaves its slot free but longer than the header.
 */
const setupLongFreeSlot = async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL;
  const { pFile } = t.openFile("/test.db-journal", flags);
  assertEqual(writeFile(t, pFile, new Uint8Array(512).fill(1)), SQLITE_OK);
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "truncate" ? { type: "Throw", error } : null,
  );
  const rc = t.callVfs("xDelete", t.cString("/test.db-journal"), 1);
  t.fake.inject(null);
  return { ...t, flags, rc };
};

test("a delete whose free header is durable succeeds when truncating the slot fails, and the next xOpen that takes the slot truncates it first", async () => {
  const t = await setupLongFreeSlot();

  assertEqual(t.rc, SQLITE_OK);
  assertEqual(t.pool.getFailure(), null);
  assertEqual(access(t, "/test.db-journal"), 0);
  assertEqual(t.pool.getPaths(), []);
  const longSlot = t
    .slotNames()
    .find((fileName) => t.readSlot(fileName).length > sahPoolHeaderSize);
  assertTrue(longSlot != null);
  assertEqual(
    t.readSlot(longSlot).subarray(0, sahPoolHeaderSize),
    freeSlotBytes(),
  );

  const calls = t.fake.calls.length;
  const { rc, pFile } = t.openFile("/other.db-journal", t.flags);
  assertEqual(rc, SQLITE_OK);
  // Truncated and flushed before the header is written, so a power loss
  // cannot keep the header with the deleted journal's bytes behind it.
  assertEqual(
    t.fake.calls
      .slice(calls)
      .filter(({ method }) => method !== "getSize")
      .map((call) => [
        call.path === `${t.directoryPath}/.opaque/${longSlot}`,
        call.method === "write"
          ? `write@${call.at}`
          : call.method === "truncate"
            ? `truncate@${call.size}`
            : call.method,
      ]),
    [
      [true, `truncate@${sahPoolHeaderSize}`],
      [true, "flush"],
      [true, "write@0"],
    ],
  );
  assertEqual(writeFile(t, pFile, Uint8Array.of(2), 1024), SQLITE_OK);

  assertEqual(t.readSlot(longSlot).length, sahPoolHeaderSize + 1025);
  assertOk(
    t.pool.read(
      "/other.db-journal",
      0 as NonNegativeInt,
      1025 as NonNegativeInt,
    ),
    Uint8Array.of(...new Uint8Array(1024), 2),
  );
});

test("xOpen fails with SQLITE_CANTOPEN when reading the size of a slot longer than the header or truncating it fails, and with SQLITE_FULL when the truncate throws QuotaExceededError, as a failed header write fails, rather than letting a new file inherit stale bytes", async () => {
  const invalidState = new DOMException("Failed.", "InvalidStateError");
  for (const [method, error, code] of [
    ["getSize", invalidState, SQLITE_CANTOPEN],
    ["truncate", invalidState, SQLITE_CANTOPEN],
    ["truncate", createQuotaExceededError(), SQLITE_FULL],
  ] as const) {
    const t = await setupLongFreeSlot();
    t.fake.inject((call) =>
      call.method === method ? { type: "Throw", error } : null,
    );

    const { rc, pFile } = t.openFile("/other.db-journal", t.flags);

    assertEqual(rc, code);
    assertEqual(t.readPtr(pFile), 0);
    assertEqual(t.pool.getFailure(), {
      method: "xOpen",
      path: "/other.db-journal",
      error,
    });
    assertEqual(t.pool.getPaths(), []);
    t.fake.inject(null);
    assertEqual(t.openFile("/other.db-journal", t.flags).rc, SQLITE_OK);
  }
});

test("setup fails with SahPoolSetupError when writing the free header of a slot it frees fails, closing every handle", async () => {
  const quotaError = createQuotaExceededError();
  for (const [fault, cause] of [
    [{ type: "Throw", error: quotaError }, quotaError],
    [
      { type: "Count", count: 0 },
      { type: "SqliteShortWrite", requested: 524, written: 0 },
    ],
  ] satisfies ReadonlyArray<readonly [FakeOpfsFault, unknown]>) {
    const fake = setupFakeOpfs();
    const bad = createSlotBytes(
      "/bad.db",
      SQLITE_OPEN_MAIN_DB | SQLITE_OPEN_READWRITE | sahPoolDigestV2Flag,
    );
    bad[sahPoolHeaderCorpusSize] ^= 1;
    fake.writeFile(".evolu/.opaque/bad", bad);
    const t = await setupSahPool({
      fake,
      directory: [OpfsName.orThrow(".other")],
    });
    fake.inject((call) =>
      call.method === "write" && call.path === ".evolu/.opaque/bad"
        ? fault
        : null,
    );

    const result = await t.openPool([OpfsName.orThrow(".evolu")]);

    assertErr(result, { type: "SahPoolSetupError", cause });
    fake.inject(null);
    fake.hold(".evolu/.opaque/bad")();
  }
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks, exportFile, which
// SahPool.read replaces.
test("SahPool.read returns the bytes at an offset of the file's data, fewer at its end, and fails with SahPoolFileNotFound or SqliteVfsIoError", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "/test.db",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
  );
  assertEqual(writeFile(t, pFile, Uint8Array.of(1, 2, 3, 4, 5)), SQLITE_OK);
  const error = new DOMException("Failed.", "InvalidStateError");

  assertOk(
    t.pool.read("/test.db", 1 as NonNegativeInt, 2 as NonNegativeInt),
    Uint8Array.of(2, 3),
  );
  assertOk(
    t.pool.read("/test.db", 3 as NonNegativeInt, 16 as NonNegativeInt),
    Uint8Array.of(4, 5),
  );
  assertErr(
    t.pool.read("/missing.db", 0 as NonNegativeInt, 16 as NonNegativeInt),
    {
      type: "SahPoolFileNotFound",
      path: "/missing.db",
    },
  );
  t.fake.inject((call) =>
    call.method === "read" ? { type: "Throw", error } : null,
  );
  assertErr(
    t.pool.read("/test.db", 0 as NonNegativeInt, 16 as NonNegativeInt),
    {
      type: "SqliteVfsIoError",
      cause: error,
    },
  );
  void (() => {
    // @ts-expect-error SahPool.read takes the offset as a NonNegativeInt, not any number, such as -4096, which would read the slot's header.
    t.pool.read("/test.db", -4096, 16 as NonNegativeInt);
    // @ts-expect-error SahPool.read takes the byte length as a NonNegativeInt, not any number, such as -1.
    t.pool.read("/test.db", 0 as NonNegativeInt, -1);
  });
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks, unlink.
test("SahPool.unlink deletes a database with its -journal and -wal and returns true, and returns false for a path the pool does not have", async () => {
  const t = await setupSahPool();
  for (const [path, type] of [
    ["/evolu1.db", SQLITE_OPEN_MAIN_DB],
    ["/evolu1.db-journal", SQLITE_OPEN_MAIN_JOURNAL],
    ["/evolu1.db-wal", SQLITE_OPEN_WAL],
    ["/evolu2.db-journal", SQLITE_OPEN_MAIN_JOURNAL],
  ] as const) {
    const { pFile } = t.openFile(
      path,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | type,
    );
    assertEqual(writeFile(t, pFile, new Uint8Array(8).fill(1)), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  }

  assertOk(t.pool.unlink("/evolu1.db"), true);
  assertEqual(t.pool.getPaths(), ["/evolu2.db-journal"]);
  assertOk(t.pool.unlink("/evolu1.db"), false);
  // A leftover journal goes with its database, even without one.
  assertOk(t.pool.unlink("/evolu2.db"), false);

  assertEqual(t.pool.getPaths(), []);
  for (const fileName of t.slotNames())
    assertEqual(t.readSlot(fileName), freeSlotBytes());
});

test("SahPool.unlink fails with SqliteVfsIoError when the free header cannot be written, keeping the file", async () => {
  const t = await setupSahPool();
  const { pFile } = t.openFile(
    "/test.db",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
  );
  assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "write" ? { type: "Throw", error } : null,
  );

  assertErr(t.pool.unlink("/test.db"), {
    type: "SqliteVfsIoError",
    cause: error,
  });

  assertEqual(t.pool.getPaths(), ["/test.db"]);
});

test("SahPool.unlink throws for a file a connection has open, whose slot would be reused under it", async () => {
  const t = await setupSahPool();
  t.openFile(
    "/test.db",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
  );

  assertThrows(
    () => t.pool.unlink("/test.db"),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "Cannot unlink /test.db, which is open.");
    },
  );
  assertEqual(t.pool.getPaths(), ["/test.db"]);
});

test("SahPool.unlink keeps the journal when deleting the database fails, so a hot journal can still roll it back", async () => {
  const t = await setupSahPool();
  for (const [path, type] of [
    ["/test.db", SQLITE_OPEN_MAIN_DB],
    ["/test.db-journal", SQLITE_OPEN_MAIN_JOURNAL],
  ] as const) {
    const { pFile } = t.openFile(
      path,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | type,
    );
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  }
  const [databaseSlot] = t.slotNames();
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "write" && call.path.endsWith(databaseSlot)
      ? { type: "Throw", error }
      : null,
  );

  assertErr(t.pool.unlink("/test.db"), {
    type: "SqliteVfsIoError",
    cause: error,
  });

  assertEqual(t.pool.getPaths(), ["/test.db", "/test.db-journal"]);
});

// The database's free header is not durable while its flush fails, and a power
// loss could bring the database back without the journal that would roll it
// back.
test("SahPool.unlink keeps the journal, failing with SqliteVfsIoError, while the database's free header cannot be flushed, and flushes it before deleting the journal once it can", async () => {
  const t = await setupSahPool();
  for (const [path, type] of [
    ["/test.db", SQLITE_OPEN_MAIN_DB],
    ["/test.db-journal", SQLITE_OPEN_MAIN_JOURNAL],
  ] as const) {
    const { pFile } = t.openFile(
      path,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | type,
    );
    assertEqual(writeFile(t, pFile, new Uint8Array(8).fill(1)), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  }
  const databaseSlot = t.findSlotPath("/test.db");
  const journalSlot = t.findSlotPath("/test.db-journal");
  const journal = t.fake.readFile(journalSlot);
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "flush" && call.path === databaseSlot
      ? { type: "Throw", error }
      : null,
  );

  assertErr(t.pool.unlink("/test.db"), {
    type: "SqliteVfsIoError",
    cause: error,
  });

  assertEqual(t.pool.getPaths(), ["/test.db-journal"]);
  assertEqual(t.fake.readFile(journalSlot), journal);
  t.fake.inject(null);
  const calls = t.fake.calls.length;
  // The database is already gone.
  assertOk(t.pool.unlink("/test.db"), false);
  assertEqual(t.pool.getPaths(), []);
  assertEqual(
    t.fake.calls
      .slice(calls)
      .filter(({ method }) => method === "flush" || method === "write")
      .map(({ method, path }) => [path === databaseSlot, method]),
    [
      [true, "flush"],
      [false, "write"],
      [false, "flush"],
    ],
  );
});

test("openSahPool fails with SahPoolSetupError when the VFS cannot be allocated, closing every handle and registering nothing, and a retry succeeds", async () => {
  const t = await setupDatabase();
  const fake = setupFakeOpfs();
  let mallocFails = true;
  const { exports } = t.sqliteWasm;
  const deps = {
    ...t,
    opfsRoot: fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_malloc: (byteLength: number) =>
          mallocFails ? 0 : exports.sqlite3_malloc(byteLength),
      },
    },
  };
  const vfsName = "opfs-sahpool:.evolu";
  await using run = testCreateRun({ ...deps, opfsRoot: fake.opfsRoot });

  const result = await run(
    openSahPool({ directory: [OpfsName.orThrow(".evolu")] }),
  );

  assertErr(result, {
    type: "SahPoolSetupError",
    cause: {
      type: "SqliteNoMem",
      byteLength:
        sqlite3_vfs_layout.sizeof +
        sqlite3_io_methods_layout.sizeof +
        vfsName.length +
        1,
    },
  });
  assertEqual(sqlite3_vfs_find(t)(t.cString(vfsName)), 0);
  for (const fileName of fake.listFiles(".evolu/.opaque"))
    fake.hold(`.evolu/.opaque/${fileName}`)();
  mallocFails = false;
  const pool = getOrThrow(
    await run(openSahPool({ directory: [OpfsName.orThrow(".evolu")] })),
  );
  assertEqual(pool.vfsName, vfsName);
  assertTrue(sqlite3_vfs_find(t)(t.cString(vfsName)) !== 0);
});

test("openSahPool fails with SahPoolSetupError when sqlite3_vfs_register fails, closing every handle and keeping nothing, and a retry succeeds", async () => {
  const t = await setupDatabase();
  const fake = setupFakeOpfs();
  let registerFails = true;
  const { exports } = t.sqliteWasm;
  const deps = {
    ...t,
    opfsRoot: fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_vfs_register: (
          ...args: Parameters<typeof exports.sqlite3_vfs_register>
        ) =>
          registerFails ? SQLITE_NOMEM : exports.sqlite3_vfs_register(...args),
      },
    },
  };
  const vfsName = "opfs-sahpool:.evolu";
  await using run = testCreateRun({ ...deps, opfsRoot: fake.opfsRoot });

  const result = await run(
    openSahPool({ directory: [OpfsName.orThrow(".evolu")] }),
  );

  assertErr(result, {
    type: "SahPoolSetupError",
    cause: { type: "SqliteWasmInitializeError", code: SQLITE_NOMEM },
  });
  assertEqual(sqlite3_vfs_find(t)(t.cString(vfsName)), 0);
  for (const fileName of fake.listFiles(".evolu/.opaque"))
    fake.hold(`.evolu/.opaque/${fileName}`)();
  const tableLength = t.sqliteWasm.functionTable.length;
  registerFails = false;
  assertOk(await run(openSahPool({ directory: [OpfsName.orThrow(".evolu")] })));
  assertTrue(sqlite3_vfs_find(t)(t.cString(vfsName)) !== 0);
  // The failed attempt's functions were disposed, so their slots are reused.
  assertEqual(t.sqliteWasm.functionTable.length, tableLength);
});

// The instance rule of Wasm.ts: an exception that escapes a wasm call breaks
// the instance, and a broken instance refuses every later call.
test("openSahPool on a broken instance throws the broken-instance error before allocating the VFS of a new directory, closing every handle", async () => {
  const t = await setupDatabase();
  const fake = setupFakeOpfs();
  const escaped = new Error("Escaped.");
  assertThrows(
    () =>
      t.sqliteWasm.call(() => {
        throw escaped;
      }),
    (thrown) => {
      assertSame(thrown, escaped);
    },
  );
  let mallocs = 0;
  const { exports } = t.sqliteWasm;
  await using run = testCreateRun({
    ...t,
    opfsRoot: fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...exports,
        sqlite3_malloc: (byteLength: number) => {
          mallocs++;
          return exports.sqlite3_malloc(byteLength);
        },
      },
    },
  });

  const result = await run.abortable(
    openSahPool({ directory: [OpfsName.orThrow(".evolu")] }),
  );

  assertErr(result);
  assert(
    result.error.type === "AbortError" &&
      result.error.reason.type === "PanicAbortReason",
    "Expected a panic",
  );
  const { defect } = result.error.reason as PanicAbortReason;
  assertInstanceOf(defect, Error);
  assertEqual(
    defect.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(defect.cause, escaped);
  assertEqual(mallocs, 0);
  for (const fileName of fake.listFiles(".evolu/.opaque"))
    fake.hold(`.evolu/.opaque/${fileName}`)();
});

test("an exception escaping sqlite3_vfs_register breaks the instance, and openSahPool still closes every handle", async () => {
  const t = await setupDatabase();
  const fake = setupFakeOpfs();
  const escaped = new Error("Escaped.");
  await using run = testCreateRun({
    ...t,
    opfsRoot: fake.opfsRoot,
    sqliteWasm: {
      ...t.sqliteWasm,
      exports: {
        ...t.sqliteWasm.exports,
        sqlite3_vfs_register: () => {
          throw escaped;
        },
      },
    },
  });

  const result = await run.abortable(
    openSahPool({ directory: [OpfsName.orThrow(".evolu")] }),
  );

  assertErr(result);
  assert(
    result.error.type === "AbortError" &&
      result.error.reason.type === "PanicAbortReason",
    "Expected a panic",
  );
  assertSame((result.error.reason as PanicAbortReason).defect, escaped);
  assertTrue(t.sqliteWasm.isBroken());
  assertEqual(fake.listFiles(".evolu/.opaque").length, 6);
  for (const fileName of fake.listFiles(".evolu/.opaque"))
    fake.hold(`.evolu/.opaque/${fileName}`)();
});

// wa-sqlite's sweep: a deleted path stayed mapped to a slot already free.
test("200 committed transactions each delete their journal: no journal path, no journal file, and still 6 slots", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);

  for (let index = 0; index < 200; index++) {
    assertEqual(t.exec(`INSERT INTO t VALUES (${index})`, db), SQLITE_OK);
    assertEqual(t.pool.getPaths(), ["/test.db"]);
    assertEqual(access(t, "/test.db-journal"), 0);
  }

  assertEqual(t.slotNames().length, 6);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "200");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("a statement whose handle method fails gets the method's extended code, no exception reaches wasm, and the connection works afterwards", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  const error = new DOMException("Failed.", "InvalidStateError");
  // Each SQL needs the method: a fresh connection reads the database, and an
  // insert writes, syncs and sizes it.
  for (const [method, sql, extendedCode] of [
    ["read", "SELECT a FROM t", SQLITE_IOERR_READ],
    ["write", "INSERT INTO t VALUES (2)", SQLITE_IOERR_WRITE],
    ["flush", "INSERT INTO t VALUES (2)", SQLITE_IOERR_FSYNC],
    ["getSize", "SELECT a FROM t", SQLITE_IOERR_FSTAT],
  ] as const) {
    const { db: other } = t.openDatabase("/test.db");
    // A data write, not the header write of opening the journal.
    t.fake.inject((call) =>
      call.method === method &&
      (call.method !== "write" || call.at >= sahPoolHeaderSize)
        ? { type: "Throw", error }
        : null,
    );

    assertEqual(t.exec(sql, other) & 0xff, SQLITE_IOERR);

    assertEqual(sqlite3_extended_errcode(t)(other), extendedCode);
    t.fake.inject(null);
    if (sqlite3_get_autocommit(t)(other) === 0)
      assertEqual(t.exec("ROLLBACK", other), SQLITE_OK);
    assertEqual(t.selectText("SELECT count(*) FROM t", other), "1");
    assertEqual(sqlite3_close_v2(t)(other), SQLITE_OK);
  }
  assertEqual(t.reportDefect.getDefects(), []);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// wa-sqlite's sweep: an exception thrown through wasm frames leaked the C
// stack until every call crashed.
test("10,000 statements whose reads fail each return SQLITE_IOERR_READ and leave the C stack pointer where it was", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  const { emscripten_stack_get_current } = t.sqliteWasm.exports as unknown as {
    readonly emscripten_stack_get_current: () => number;
  };
  const error = new DOMException("Failed.", "InvalidStateError");
  const failRead: FakeOpfsFaultHook = (call) =>
    call.method === "read" ? { type: "Throw", error } : null;
  const stackPointer = emscripten_stack_get_current();
  const sql = t.cString("SELECT a FROM t");
  let failed = 0;

  for (let index = 0; index < 10_000; index++) {
    // A new connection, so the statement reads the database.
    const { db: other } = t.openDatabase("/test.db");
    t.fake.inject(failRead);
    if (sqlite3_exec(t)(other, sql, 0, 0, 0) === SQLITE_IOERR) failed++;
    t.fake.inject(null);
    sqlite3_close_v2(t)(other);
    if (emscripten_stack_get_current() !== stackPointer) break;
  }

  assertEqual(failed, 10_000);
  assertEqual(emscripten_stack_get_current(), stackPointer);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// The forum post on SQLITE_FULL, through SQLite: a commit whose database writes
// fail reports what the browser said, and the database stays as it was.
test("a COMMIT whose database writes fail returns SQLITE_FULL for a full disk and SQLITE_IOERR_WRITE otherwise, with the cause, and the database keeps its data before the transaction", async () => {
  class QuotaExceededError extends DOMException {
    constructor() {
      super("The quota has been exceeded.", "QuotaExceededError");
    }
  }
  const subclassQuotaError = new QuotaExceededError();
  const plainQuotaError = Object.assign(new Error("Quota."), {
    name: "QuotaExceededError",
  });
  const domQuotaError = createQuotaExceededError();
  const invalidState = new DOMException("Failed.", "InvalidStateError");
  // The build's default, 8192 bytes, which each page write requests.
  const pageSize = 8192;
  for (const [fault, code, extendedCode, error] of [
    [
      { type: "Throw", error: domQuotaError },
      SQLITE_FULL,
      SQLITE_FULL,
      domQuotaError,
    ],
    [
      { type: "Throw", error: subclassQuotaError },
      SQLITE_FULL,
      SQLITE_FULL,
      subclassQuotaError,
    ],
    [
      { type: "Throw", error: plainQuotaError },
      SQLITE_FULL,
      SQLITE_FULL,
      plainQuotaError,
    ],
    [
      { type: "Count", count: 0 },
      SQLITE_FULL,
      SQLITE_FULL,
      { type: "SqliteShortWrite", requested: pageSize, written: 0 },
    ],
    [
      { type: "Count", count: 0xfffffff8 },
      SQLITE_FULL,
      SQLITE_FULL,
      { type: "SqliteShortWrite", requested: pageSize, written: 0xfffffff8 },
    ],
    [
      { type: "Throw", error: invalidState },
      SQLITE_IOERR,
      SQLITE_IOERR_WRITE,
      invalidState,
    ],
  ] satisfies ReadonlyArray<
    readonly [FakeOpfsFault, number, number, unknown]
  >) {
    const t = await setupSahPool();
    const { db } = t.openDatabase("/test.db");
    assertEqual(
      t.exec("CREATE TABLE t(v); INSERT INTO t VALUES (1), (2), (3)", db),
      SQLITE_OK,
    );
    const databaseSlot = t.findSlotPath("/test.db");
    assertEqual(t.selectText("PRAGMA page_size", db), String(pageSize));
    assertEqual(t.exec("BEGIN", db), SQLITE_OK);
    assertEqual(
      t.exec(
        "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 100) INSERT INTO t SELECT randomblob(1000) FROM c",
        db,
      ),
      SQLITE_OK,
    );
    t.fake.inject((call) =>
      call.method === "write" &&
      call.path === databaseSlot &&
      call.at >= sahPoolHeaderSize
        ? fault
        : null,
    );
    t.pool.clearFailure();

    assertEqual(t.exec("COMMIT", db), code);

    assertEqual(sqlite3_extended_errcode(t)(db), extendedCode);
    assertEqual(t.pool.getFailure(), {
      method: "xWrite",
      path: "/test.db",
      error,
    });
    t.fake.inject(null);
    if (sqlite3_get_autocommit(t)(db) === 0)
      assertEqual(t.exec("ROLLBACK", db), SQLITE_OK);
    const { db: reopened } = t.openDatabase("/test.db");
    for (const connection of [db, reopened]) {
      assertEqual(
        t.selectText("SELECT group_concat(v) FROM t", connection),
        "1,2,3",
      );
      assertEqual(t.selectText("PRAGMA integrity_check", connection), "ok");
    }
    assertEqual(t.exec("INSERT INTO t VALUES (4)", db), SQLITE_OK);
    assertEqual(t.pool.getPaths(), ["/test.db"]);
    assertEqual(sqlite3_close_v2(t)(reopened), SQLITE_OK);
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  }
});

test("an ATTACH that finds no free slot fails with SQLITE_CANTOPEN and the recorded SahPoolFull, never reaching xClose, and works again after a DETACH", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/main.db");
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  for (let index = 1; index <= 5; index++)
    assertEqual(t.exec(`ATTACH '/a${index}.db' AS a${index}`, db), SQLITE_OK);
  t.pool.clearFailure();

  assertEqual(t.exec("ATTACH '/a6.db' AS a6", db), SQLITE_CANTOPEN);

  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: "/a6.db",
    error: { type: "SahPoolFull", capacity: 6 },
  });
  assertEqual(t.reportDefect.getDefects(), []);
  assertEqual(t.exec("DETACH a5", db), SQLITE_OK);
  assertEqual(t.callVfs("xDelete", t.cString("/a5.db"), 0), SQLITE_OK);
  assertEqual(t.exec("ATTACH '/a6.db' AS a6", db), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// wa-sqlite test/vfs_rollback.js and sql_0001.js: a rollback of a transaction
// that spilled the page cache.
test("ROLLBACK of a transaction that spilled the page cache restores the rows, and PERSIST and TRUNCATE journals keep the database intact across a reopen", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec(
      "PRAGMA cache_size = 10; CREATE TABLE t(x); INSERT INTO t VALUES ('before')",
      db,
    ),
    SQLITE_OK,
  );

  assertEqual(t.exec("BEGIN", db), SQLITE_OK);
  assertEqual(
    t.exec(
      "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 20000) INSERT INTO t SELECT x FROM c",
      db,
    ),
    SQLITE_OK,
  );
  assertEqual(t.exec("ROLLBACK", db), SQLITE_OK);

  assertEqual(t.selectText("PRAGMA integrity_check", db), "ok");
  assertEqual(t.selectText("SELECT group_concat(x) FROM t", db), "before");
  for (const mode of ["PERSIST", "TRUNCATE"]) {
    assertEqual(t.exec(`PRAGMA journal_mode = ${mode}`, db), SQLITE_OK);
    for (let index = 0; index < 50; index++)
      assertEqual(
        t.exec(`UPDATE t SET x = '${mode}${index}' WHERE rowid = 1`, db),
        SQLITE_OK,
      );
    const { db: reopened } = t.openDatabase("/test.db");
    assertEqual(t.selectText("PRAGMA integrity_check", reopened), "ok");
    assertEqual(t.selectText("SELECT x FROM t", reopened), `${mode}49`);
    assertEqual(sqlite3_close_v2(t)(reopened), SQLITE_OK);
  }
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// Chrome on macOS flushes OPFS with F_FULLFSYNC, so every flush costs.
test("a committed transaction flushes as SQLite syncs, and the pool adds only the flush of a free slot before a new file's header and of a deleted journal's free header", async () => {
  for (const [pragmas, expected] of [
    // The free slot is flushed before the journal's header is written, which
    // is not flushed: SQLite syncs the journal before relying on it. Deleting
    // it flushes its free header.
    [
      "",
      [
        "flush journal",
        "write@0 journal",
        "flush journal",
        "flush journal",
        "flush database",
        "write@0 journal",
        "flush journal",
        "truncate journal",
      ],
    ],
    [
      "PRAGMA locking_mode = EXCLUSIVE;",
      ["flush journal", "flush journal", "flush database", "flush journal"],
    ],
    [
      "PRAGMA journal_mode = TRUNCATE;",
      [
        "flush journal",
        "flush journal",
        "flush database",
        "truncate journal",
        "flush journal",
      ],
    ],
    [
      "PRAGMA journal_mode = PERSIST;",
      ["flush journal", "flush journal", "flush database", "flush journal"],
    ],
  ] as const) {
    const t = await setupSahPool();
    const { db } = t.openDatabase("/test.db");
    assertEqual(
      t.exec(`${pragmas} CREATE TABLE t(a); INSERT INTO t VALUES (0)`, db),
      SQLITE_OK,
    );
    const databaseSlot = t.findSlotPath("/test.db");
    const calls = t.fake.calls.length;

    assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_OK);

    assertEqual(
      t.fake.calls
        .slice(calls)
        .filter(
          (call) =>
            call.method === "flush" ||
            call.method === "truncate" ||
            (call.method === "write" && call.at === 0),
        )
        .map(
          (call) =>
            `${call.method}${call.method === "write" ? "@0" : ""} ${call.path === databaseSlot ? "database" : "journal"}`,
        ),
      expected,
    );
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  }
});

// Opening a journal of a database without a key, the pool reads the
// database's first 16 bytes, because a journal that exists can be the hot
// journal of an encrypted database. A journal the open creates holds nothing
// to roll back.
test("a committed transaction reads as SQLite reads, and the pool adds only a read of the first 16 bytes of a database without a key when it opens a journal that exists, as TRUNCATE and PERSIST keep it, not one the transaction creates", async () => {
  // SQLite reads the change counter at 24, the first byte of a journal it
  // keeps, to tell whether it is hot, and 8 bytes after the records to zero
  // a stale header.
  const truncateOrPersist = [
    "read@0+16 database",
    "read@0+1 journal",
    "read@24+16 database",
    "read@0+16 database",
    "read@24576+8 journal",
  ];
  for (const [pragmas, expected] of [
    ["", ["read@24+16 database", "read@24576+8 journal"]],
    ["PRAGMA locking_mode = EXCLUSIVE;", ["read@16384+8 journal"]],
    ["PRAGMA journal_mode = TRUNCATE;", truncateOrPersist],
    ["PRAGMA journal_mode = PERSIST;", truncateOrPersist],
  ] as const) {
    const t = await setupSahPool();
    const { db } = t.openDatabase("/test.db");
    assertEqual(
      t.exec(`${pragmas} CREATE TABLE t(a); INSERT INTO t VALUES (0)`, db),
      SQLITE_OK,
    );
    const databaseSlot = t.findSlotPath("/test.db");
    const calls = t.fake.calls.length;

    assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_OK);

    assertEqual(
      t.fake.calls
        .slice(calls)
        .flatMap((call) =>
          call.method === "read"
            ? [
                `read@${call.at - sahPoolHeaderSize}+${call.length} ${call.path === databaseSlot ? "database" : "journal"}`,
              ]
            : [],
        ),
      expected,
    );
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  }
});

test("a database opened as file:evolu1.db or evolu1.db is /evolu1.db in the pool, with the journal /evolu1.db-journal", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("file:evolu1.db", {
    flags: SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI,
  });
  const { db: other } = t.openDatabase("evolu1.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); BEGIN; INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );

  assertEqual(t.pool.getPaths(), ["/evolu1.db", "/evolu1.db-journal"]);
  assertEqual(t.exec("COMMIT", db), SQLITE_OK);
  assertEqual(t.selectText("SELECT a FROM t", other), "1");
  assertEqual(t.pool.getPaths(), ["/evolu1.db"]);
  assertEqual(sqlite3_close_v2(t)(other), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// tester1 OPFS SyncAccessHandle Pool VFS / SAH sanity checks: two pools
// coexist with different names.
test("pools in different directories coexist on one instance, each with its own VFS and files", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".a")] });
  const b = getOrThrow(await t.openPool([OpfsName.orThrow(".b")]));
  const { db: dbA } = t.openDatabase("/test.db");
  const { db: dbB } = t.openDatabase("/test.db", { vfsName: b.vfsName });

  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('a')", dbA),
    SQLITE_OK,
  );
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('b')", dbB),
    SQLITE_OK,
  );

  assertEqual(b.vfsName, "opfs-sahpool:.b");
  assertTrue(t.findVfs(b.vfsName) !== t.findVfs());
  assertEqual(t.selectText("SELECT a FROM t", dbA), "a");
  assertEqual(t.selectText("SELECT a FROM t", dbB), "b");
  assertEqual(t.fake.listFiles(".a/.opaque").length, 6);
  assertEqual(t.fake.listFiles(".b/.opaque").length, 6);
  assertEqual(sqlite3_close_v2(t)(dbA), SQLITE_OK);
  assertEqual(sqlite3_close_v2(t)(dbB), SQLITE_OK);
});

test("opening a directory the instance already has open fails with SahPoolAlreadyOpenError before it touches OPFS, and leaves the open pool working", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  const calls = t.fake.calls.length;

  const result = await t.openPool();

  assertErr(result, { type: "SahPoolAlreadyOpenError", directory: [".evolu"] });
  assertEqual(t.fake.calls.slice(calls), []);
  assertEqual(t.exec("INSERT INTO t VALUES (2)", db), SQLITE_OK);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "2");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("of two concurrent opens of one new directory on an instance, one succeeds and the other fails with SahPoolAlreadyOpenError, creating only one set of slots", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".other")] });

  const results = await Promise.all([
    t.openPool([OpfsName.orThrow(".evolu")]),
    t.openPool([OpfsName.orThrow(".evolu")]),
  ]);

  const pools = results.filter((result) => result.ok).map(getOrThrow);
  assertEqual(pools.length, 1);
  assertEqual(
    results.filter((result) => !result.ok).map((result) => result.error),
    [{ type: "SahPoolAlreadyOpenError", directory: [".evolu"] }],
  );
  assertEqual(t.fake.listFiles(".evolu/.opaque").length, 6);
  const { rc, db } = t.openDatabase("/evolu1.db", {
    vfsName: pools[0].vfsName,
  });
  assertEqual(rc, SQLITE_OK);
  assertEqual(t.exec("CREATE TABLE t(a)", db), SQLITE_OK);
  assertEqual(pools[0].getPaths(), ["/evolu1.db"]);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("of two concurrent opens of the directory [a, b] on an instance, one opens the directory b in a, whose VFS is opfs-sahpool:a/b, and the other fails with SahPoolAlreadyOpenError, creating only one set of slots", async () => {
  const t = await setupSahPool({ directory: [OpfsName.orThrow(".other")] });
  const directory = [OpfsName.orThrow("a"), OpfsName.orThrow("b")] as const;

  const results = await Promise.all([
    t.openPool(directory),
    t.openPool(directory),
  ]);

  assertEqual(
    results.map((result) => (result.ok ? result.value.vfsName : result.error)),
    [
      "opfs-sahpool:a/b",
      { type: "SahPoolAlreadyOpenError", directory: ["a", "b"] },
    ],
  );
  assertEqual(t.fake.listFiles("a/b"), []);
  assertEqual(t.fake.listFiles("a/b/.opaque").length, 6);
});

test("opening the directory [a, b] while the instance has it open fails with SahPoolAlreadyOpenError before it touches OPFS, and opening it once the pool is disposed reopens the pool in its VFS", async () => {
  const t = await setupSahPool({
    directory: [OpfsName.orThrow("a"), OpfsName.orThrow("b")],
  });
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const vfs = t.findVfs();
  const calls = t.fake.calls.length;

  assertErr(await t.openPool(), {
    type: "SahPoolAlreadyOpenError",
    directory: ["a", "b"],
  });

  assertEqual(t.fake.calls.slice(calls), []);
  t.pool[Symbol.dispose]();
  const pool = getOrThrow(await t.openPool());
  assertEqual(pool.vfsName, "opfs-sahpool:a/b");
  assertEqual(t.findVfs(pool.vfsName), vfs);
  assertEqual(pool.getPaths(), ["/test.db"]);
});

// tester1 Bug Reports / r/o connection recovery from write op error (forum
// cf37d5ff11).
test("a read-only connection fails a write with SQLITE_READONLY and still reads", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1), (2), (3)", db),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const { rc, db: readOnly } = t.openDatabase("/test.db", {
    flags: SQLITE_OPEN_READONLY,
  });
  assertEqual(rc, SQLITE_OK);

  assertEqual(t.exec("INSERT INTO t VALUES (4)", readOnly), SQLITE_READONLY);

  assertEqual(t.selectText("SELECT group_concat(a) FROM t", readOnly), "1,2,3");
  assertEqual(sqlite3_close_v2(t)(readOnly), SQLITE_OK);
});

// sahpool-pausing.js runPyramidOfDoom, with two instances on one OPFS in place
// of two workers.
test("a second instance cannot open a pool the first holds, failing with SahPoolHeldError having written nothing, and takes it over with its data once the first disposes it", async () => {
  const first = await setupSahPool();
  const { db } = first.openDatabase("/test.db");
  assertEqual(
    first.exec("CREATE TABLE t(a); INSERT INTO t VALUES (11), (22), (33)", db),
    SQLITE_OK,
  );
  const second = await setupSahPool({
    fake: first.fake,
    directory: [OpfsName.orThrow(".other")],
  });
  const calls = first.fake.calls.length;

  const held = await second.openPool([OpfsName.orThrow(".evolu")]);

  assertErr(held);
  assert(held.error.type === "SahPoolHeldError", "Expected Held");
  assertEqual(held.error.fileName, first.slotNames()[0]);
  assertInstanceOf(held.error.cause, DOMException);
  assertEqual(held.error.cause.name, "NoModificationAllowedError");
  assertEqual(
    first.fake.calls
      .slice(calls)
      .filter(({ method }) =>
        ["read", "write", "truncate", "flush"].includes(method),
      ),
    [],
  );
  assertEqual(sqlite3_close_v2(first)(db), SQLITE_OK);
  first.pool[Symbol.dispose]();
  const pool = getOrThrow(await second.openPool([OpfsName.orThrow(".evolu")]));
  const { db: taken } = second.openDatabase("/test.db", {
    vfsName: pool.vfsName,
  });
  assertEqual(
    second.selectText("SELECT group_concat(a) FROM t", taken),
    "11,22,33",
  );
  assertEqual(sqlite3_close_v2(second)(taken), SQLITE_OK);
  // A disposed pool is unusable.
  assertThrows(
    () => first.pool.getPaths(),
    (thrown) => {
      assertInstanceOf(thrown, Error);
      assertEqual(thrown.message, "Cannot use a disposed object.");
    },
  );
});

// Safari's tracking prevention, storage pressure or clearing site data can
// remove the pool directory or its files.
test("openSahPool recreates .opaque in a directory without it, and fills an empty .opaque, with 6 free slots", async () => {
  const fake = setupFakeOpfs();
  fake.writeFile(".evolu/unrelated", Uint8Array.of(1));
  fake.writeFile(".empty/.opaque/.keep/unrelated", Uint8Array.of(1));
  const t = await setupSahPool({ fake });
  const empty = getOrThrow(await t.openPool([OpfsName.orThrow(".empty")]));

  for (const directory of [".evolu", ".empty"]) {
    const slots = fake.listFiles(`${directory}/.opaque`);
    assertEqual(slots.length, 6);
    for (const fileName of slots)
      assertEqual(
        fake.readFile(`${directory}/.opaque/${fileName}`),
        freeSlotBytes(),
      );
  }
  assertEqual(t.pool.getPaths(), []);
  assertEqual(empty.getPaths(), []);
  // Files outside .opaque are not the pool's.
  assertEqual(fake.readFile(".evolu/unrelated"), Uint8Array.of(1));
});

/**
 * Returns the slots of two databases at /same.db, one with the row 'A' and one
 * with 'B', as two opens of an empty directory not serialized can leave them.
 */
const setupSameDbBranches = async (): Promise<
  readonly [Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>]
> => {
  const branches: Array<Uint8Array<ArrayBuffer>> = [];
  for (const value of ["A", "B"]) {
    const t = await setupSahPool();
    const { db } = t.openDatabase("/same.db");
    assertEqual(
      t.exec(`CREATE TABLE t(a); INSERT INTO t VALUES ('${value}')`, db),
      SQLITE_OK,
    );
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
    const bytes = t.fake.readFile(t.findSlotPath("/same.db"));
    assert(bytes != null, "Expected the slot of /same.db");
    branches.push(bytes);
  }
  const [a, b] = branches;
  return [a, b];
};

// opfs-sahpool's acquireAccessHandles maps a path to the slot listed last and
// keeps an earlier slot with the same path out of its available slots.
test("of two slots whose headers map one path, as two opens of an empty directory not serialized can leave them, the one listed last is the file and the other is never truncated or reused, also by a write that creates a journal", async () => {
  const [hidden, visible] = await setupSameDbBranches();
  const fake = setupFakeOpfs();
  fake.writeFile(".evolu/.opaque/hidden", hidden);
  fake.writeFile(".evolu/.opaque/visible", visible);
  const t = await setupSahPool({ fake });

  assertEqual(t.pool.getPaths(), ["/same.db"]);
  const { db } = t.openDatabase("/same.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "B");
  assertEqual(t.exec("INSERT INTO t VALUES ('C')", db), SQLITE_OK);
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "B,C");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  assertEqual(t.readSlot("hidden"), hidden);
  t.pool[Symbol.dispose]();
  const pool = getOrThrow(await t.openPool());
  assertEqual(pool.getPaths(), ["/same.db"]);
  const { db: reopened } = t.openDatabase("/same.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", reopened), "B,C");
  assertEqual(sqlite3_close_v2(t)(reopened), SQLITE_OK);
  assertEqual(t.readSlot("hidden"), hidden);
});

// opfs-sahpool frees only the slot listed last, so its next open shows the
// other again, and hides a file created at the path in a slot listed before it.
test("deleting a path that two slots map frees both, so the deleted file does not come back on the next open, and a file created at the path later is the one that opens", async () => {
  const [hidden, visible] = await setupSameDbBranches();
  const fake = setupFakeOpfs();
  // Listed first, so the next file takes it.
  fake.writeFile(".evolu/.opaque/free", freeSlotBytes());
  fake.writeFile(".evolu/.opaque/hidden", hidden);
  fake.writeFile(".evolu/.opaque/visible", visible);
  const t = await setupSahPool({ fake });

  assertOk(t.pool.unlink("/same.db"), true);
  t.pool[Symbol.dispose]();
  const reopened = getOrThrow(await t.openPool());

  assertEqual(reopened.getPaths(), []);
  assertEqual(t.readSlot("hidden"), freeSlotBytes());
  assertEqual(t.readSlot("visible"), freeSlotBytes());
  const { db } = t.openDatabase("/same.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('C')", db),
    SQLITE_OK,
  );
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  reopened[Symbol.dispose]();
  using _pool = getOrThrow(await t.openPool());
  const { db: again } = t.openDatabase("/same.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", again), "C");
  assertEqual(sqlite3_close_v2(t)(again), SQLITE_OK);
});

test("deleting a path that two slots map fails with SQLITE_IOERR_DELETE when the other slot's free header cannot be written, keeping the path mapped to its file", async () => {
  const [hidden, visible] = await setupSameDbBranches();
  const fake = setupFakeOpfs();
  fake.writeFile(".evolu/.opaque/hidden", hidden);
  fake.writeFile(".evolu/.opaque/visible", visible);
  const t = await setupSahPool({ fake });
  const error = createQuotaExceededError();
  fake.inject((call) =>
    call.method === "write" && call.path === ".evolu/.opaque/hidden"
      ? { type: "Throw", error }
      : null,
  );

  assertEqual(
    t.callVfs("xDelete", t.cString("/same.db"), 1),
    SQLITE_IOERR_DELETE,
  );

  assertEqual(t.pool.getFailure(), {
    method: "xDelete",
    path: "/same.db",
    error,
  });
  assertEqual(t.pool.getPaths(), ["/same.db"]);
  assertEqual(t.readSlot("hidden"), hidden);
  assertEqual(t.readSlot("visible"), visible);
  fake.inject(null);
  const { db } = t.openDatabase("/same.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "B");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// A free header that a short write already changed names no path on disk, so
// the delete goes on.
test("deleting a path that two slots map frees both when the other slot's free header write comes up short after changing a byte, so the path is gone in the pool and after a reopen", async () => {
  const [hidden, visible] = await setupSameDbBranches();
  const fake = setupFakeOpfs();
  fake.writeFile(".evolu/.opaque/hidden", hidden);
  fake.writeFile(".evolu/.opaque/visible", visible);
  const t = await setupSahPool({ fake });
  fake.inject((call) =>
    call.method === "write" && call.path === ".evolu/.opaque/hidden"
      ? { type: "Count", count: 1 }
      : null,
  );

  assertEqual(t.callVfs("xDelete", t.cString("/same.db"), 0), SQLITE_OK);

  fake.inject(null);
  assertEqual(t.pool.getFailure(), null);
  assertEqual(t.pool.getPaths(), []);
  t.pool[Symbol.dispose]();
  using reopened = getOrThrow(await t.openPool());
  assertEqual(reopened.getPaths(), []);
});

// The other slot is freed, but its free header is not durable while its flush
// fails, so the file's own slot is not freed before it.
test("deleting a path that two slots map fails with SQLITE_IOERR_DELETE when the other slot's free header cannot be flushed, keeping the path mapped to its file", async () => {
  const [hidden, visible] = await setupSameDbBranches();
  const fake = setupFakeOpfs();
  fake.writeFile(".evolu/.opaque/hidden", hidden);
  fake.writeFile(".evolu/.opaque/visible", visible);
  const t = await setupSahPool({ fake });
  const error = createQuotaExceededError();
  fake.inject((call) =>
    call.method === "flush" && call.path === ".evolu/.opaque/hidden"
      ? { type: "Throw", error }
      : null,
  );

  assertEqual(
    t.callVfs("xDelete", t.cString("/same.db"), 0),
    SQLITE_IOERR_DELETE,
  );

  assertEqual(t.pool.getFailure(), {
    method: "xDelete",
    path: "/same.db",
    error,
  });
  assertEqual(t.pool.getPaths(), ["/same.db"]);
  assertEqual(t.readSlot("hidden"), freeSlotBytes());
  assertEqual(t.readSlot("visible"), visible);
  fake.inject(null);
  const { db } = t.openDatabase("/same.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "B");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// opfs-sahpool's deletePath, and wa-sqlite's sweep: a deleted path must not
// stay mapped to a slot that is already free.
test("a deleted file is gone for xAccess, getPaths and xOpen without CREATE, the next two files take different slots, and a reopened pool sees the same headers", async () => {
  const t = await setupSahPool();
  const flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE;
  const journal = t.openFile("/a.db-journal", flags | SQLITE_OPEN_MAIN_JOURNAL);
  assertEqual(
    writeFile(t, journal.pFile, new Uint8Array(64).fill(1)),
    SQLITE_OK,
  );
  assertEqual(t.callIo(journal.pFile, "xClose"), SQLITE_OK);

  assertEqual(t.callVfs("xDelete", t.cString("/a.db-journal"), 1), SQLITE_OK);

  assertEqual(access(t, "/a.db-journal"), 0);
  assertEqual(t.pool.getPaths(), []);
  assertEqual(
    t.openFile("/a.db-journal", SQLITE_OPEN_READWRITE).rc,
    SQLITE_CANTOPEN,
  );
  const first = t.openFile("/b.db", flags | SQLITE_OPEN_MAIN_DB);
  const second = t.openFile("/c.db", flags | SQLITE_OPEN_MAIN_DB);
  assertEqual([first.rc, second.rc], [SQLITE_OK, SQLITE_OK]);
  assertTrue(t.findSlotPath("/b.db") !== t.findSlotPath("/c.db"));
  assertEqual(t.callIo(second.pFile, "xClose"), SQLITE_OK);
  assertEqual(t.callIo(first.pFile, "xClose"), SQLITE_OK);
  const headers = t
    .slotNames()
    .map((fileName) => t.readSlot(fileName).subarray(0, sahPoolHeaderSize));
  t.pool[Symbol.dispose]();
  const pool = getOrThrow(await t.openPool());
  assertEqual(pool.getPaths(), ["/b.db", "/c.db"]);
  assertEqual(
    t
      .slotNames()
      .map((fileName) => t.readSlot(fileName).subarray(0, sahPoolHeaderSize)),
    headers,
  );
});

test("a write whose journal cannot be created because its header write hits the quota fails with SQLITE_FULL from xOpen, and the next write works", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  const databaseSlot = t.findSlotPath("/test.db");
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "write" && call.at === 0 && call.path !== databaseSlot
      ? { type: "Throw", error }
      : null,
  );
  t.pool.clearFailure();

  assertEqual(t.exec("INSERT INTO t VALUES (2)", db), SQLITE_FULL);

  assertEqual(t.pool.getFailure(), {
    method: "xOpen",
    path: "/test.db-journal",
    error,
  });
  assertEqual(t.pool.getPaths(), ["/test.db"]);
  t.fake.inject(null);
  assertEqual(t.exec("INSERT INTO t VALUES (3)", db), SQLITE_OK);
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", db), "1,3");
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

// When space runs out at the journal delete that commits, COMMIT fails with
// SQLITE_IOERR_DELETE although the database has the new pages, so the journal
// must stay to roll them back.
test("a COMMIT whose journal delete fails returns SQLITE_IOERR_DELETE and keeps the journal, which a reopened connection rolls back", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(
    t.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1)", db),
    SQLITE_OK,
  );
  const databaseSlot = t.findSlotPath("/test.db");
  assertEqual(t.exec("BEGIN; INSERT INTO t VALUES (2)", db), SQLITE_OK);
  const journalSlot = t.findSlotPath("/test.db-journal");
  const error = createQuotaExceededError();
  t.fake.inject((call) =>
    call.method === "write" && call.at === 0 && call.path === journalSlot
      ? { type: "Throw", error }
      : null,
  );

  assertEqual(t.exec("COMMIT", db), SQLITE_IOERR);

  assertEqual(sqlite3_extended_errcode(t)(db), SQLITE_IOERR_DELETE);
  assertEqual(t.pool.getFailure(), {
    method: "xDelete",
    path: "/test.db-journal",
    error,
  });
  t.fake.inject(null);
  assertEqual(t.pool.getPaths(), ["/test.db", "/test.db-journal"]);
  assertEqual(access(t, "/test.db-journal"), 1);
  assertTrue(databaseSlot !== journalSlot);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
  const { db: reopened } = t.openDatabase("/test.db");
  assertEqual(t.selectText("SELECT group_concat(a) FROM t", reopened), "1");
  assertEqual(t.selectText("PRAGMA integrity_check", reopened), "ok");
  assertEqual(t.pool.getPaths(), ["/test.db"]);
  assertEqual(sqlite3_close_v2(t)(reopened), SQLITE_OK);
});

// wa-sqlite test/vfs_sparse_write.js: writes that do not line up with what is
// already stored.
test("writes out of order, over more than a block held, across a gap, and of a single byte read back as written", async () => {
  const t = await setupSahPool();
  const page = 4096;
  const filled = (byte: number, length: number) =>
    new Uint8Array(length).fill(byte);
  const readBack = (pFile: SqliteFilePtr, length: number, offset: number) => {
    const pRead = getOrThrow(allocWasm(t)(length));
    assertEqual(
      t.callIo(pFile, "xRead", pRead, length, BigInt(offset)),
      SQLITE_OK,
    );
    return copyWasmBytes(t)(pRead, length);
  };
  const open = (name: string) =>
    t.openFile(name, SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE).pFile;

  // A gap filled last.
  const gap = open("sparse-gap");
  assertEqual(writeFile(t, gap, filled(1, page), 0), SQLITE_OK);
  assertEqual(writeFile(t, gap, filled(3, page), 2 * page), SQLITE_OK);
  assertEqual(writeFile(t, gap, filled(2, page), page), SQLITE_OK);
  assertEqual(readBack(gap, page, 0), filled(1, page));
  assertEqual(readBack(gap, page, page), filled(2, page));
  assertEqual(readBack(gap, page, 2 * page), filled(3, page));

  // A block written over with more than it holds.
  const grow = open("sparse-grow");
  assertEqual(writeFile(t, grow, filled(1, 512), 0), SQLITE_OK);
  assertEqual(writeFile(t, grow, filled(2, page), 0), SQLITE_OK);
  assertEqual(readBack(grow, page, 0), filled(2, page));

  // A write that fills a gap and runs over a block starting inside it.
  const inner = open("sparse-inner");
  assertEqual(writeFile(t, inner, filled(1, 1024), 0), SQLITE_OK);
  assertEqual(writeFile(t, inner, filled(2, 8), 1032), SQLITE_OK);
  assertEqual(writeFile(t, inner, filled(3, 512), 1024), SQLITE_OK);
  assertEqual(readBack(inner, 512, 1024), filled(3, 512));
  assertEqual(readBack(inner, 4, 1032), filled(3, 4));

  // SQLite overwrites a single byte to invalidate a stale journal header.
  const byte = open("sparse-byte");
  assertEqual(writeFile(t, byte, filled(1, 512), 0), SQLITE_OK);
  assertEqual(writeFile(t, byte, filled(2, 1), 8), SQLITE_OK);
  assertEqual(
    readBack(byte, 12, 0),
    Uint8Array.of(1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1),
  );
});

// wa-sqlite test/vfs_leak.js: no storage kept past the end of the database.
test("a database shrunk by DELETE and VACUUM keeps no bytes past its last page", async () => {
  const t = await setupSahPool();
  const { db } = t.openDatabase("/test.db");
  assertEqual(t.exec("CREATE TABLE t(x)", db), SQLITE_OK);
  assertEqual(
    t.exec(
      "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 20000) INSERT INTO t SELECT x FROM c",
      db,
    ),
    SQLITE_OK,
  );
  const grown = t.fake.readFile(t.findSlotPath("/test.db"))?.length ?? 0;

  assertEqual(t.exec("DELETE FROM t; VACUUM", db), SQLITE_OK);

  const pageCount = Number(t.selectText("PRAGMA page_count", db));
  const pageSize = Number(t.selectText("PRAGMA page_size", db));
  const length = t.fake.readFile(t.findSlotPath("/test.db"))?.length ?? 0;
  assertTrue(length < grown);
  assertEqual(length, sahPoolHeaderSize + pageCount * pageSize);
  assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
});

test("a name that is not a valid URL path fails xOpen with SQLITE_CANTOPEN and xDelete with SQLITE_IOERR_DELETE, recording the error, and xAccess finds no file", async () => {
  const t = await setupSahPool();

  const { rc, pFile } = t.openFile(
    "//[",
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE,
  );

  assertEqual(rc, SQLITE_CANTOPEN);
  assertEqual(t.readPtr(pFile), 0);
  const failure = t.pool.getFailure();
  assert(failure != null, "No failure was recorded");
  assertEqual(failure.method, "xOpen");
  assertEqual(failure.path, null);
  assertInstanceOf(failure.error, TypeError);
  assertEqual(t.callVfs("xDelete", t.cString("//["), 0), SQLITE_IOERR_DELETE);
  assertEqual(access(t, "//["), 0);
  assertEqual(t.reportDefect.getDefects(), []);
});

// A query, a fragment or a host would swallow the suffix SQLite appends, so a
// database and its journal would be one file.
test("a name with a query, a fragment or a host fails xOpen with SQLITE_CANTOPEN and xDelete with SQLITE_IOERR_DELETE, recording SahPoolInvalidPath, and xAccess finds no file", async () => {
  const t = await setupSahPool();

  for (const name of ["/a?b.db", "/a#b.db", "/x.db?", "//evolu.db"]) {
    t.pool.clearFailure();
    const { rc, pFile } = t.openFile(
      name,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB,
    );

    assertEqual(rc, SQLITE_CANTOPEN);
    assertEqual(t.readPtr(pFile), 0);
    assertEqual(t.pool.getFailure(), {
      method: "xOpen",
      path: null,
      error: { type: "SahPoolInvalidPath", name },
    });
    t.pool.clearFailure();
    assertEqual(t.callVfs("xDelete", t.cString(name), 0), SQLITE_IOERR_DELETE);
    assertEqual(t.pool.getFailure(), {
      method: "xDelete",
      path: null,
      error: { type: "SahPoolInvalidPath", name },
    });
    assertEqual(access(t, name), 0);
  }
  assertEqual(t.pool.getPaths(), []);
});

test("a journal name with a query, a fragment or a host never resolves to the file of another database", async () => {
  const t = await setupSahPool();
  const flags =
    SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_DB;
  const data = Uint8Array.of(1, 2, 3, 4);
  for (const name of ["/a", "/"]) {
    const { pFile } = t.openFile(name, flags);
    assertEqual(writeFile(t, pFile, data), SQLITE_OK);
    assertEqual(t.callIo(pFile, "xClose"), SQLITE_OK);
  }

  for (const name of [
    "/a?b.db-journal",
    "/a#b.db-journal",
    "//evolu.db-journal",
  ]) {
    assertEqual(access(t, name), 0);
    assertEqual(
      t.openFile(
        name,
        SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_MAIN_JOURNAL,
      ).rc,
      SQLITE_CANTOPEN,
    );
    assertEqual(t.callVfs("xDelete", t.cString(name), 0), SQLITE_IOERR_DELETE);
  }

  assertEqual(t.pool.getPaths(), ["/a", "/"]);
  assertOk(
    t.pool.read("/a", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
  assertOk(
    t.pool.read("/", 0 as NonNegativeInt, data.length as NonNegativeInt),
    data,
  );
});
