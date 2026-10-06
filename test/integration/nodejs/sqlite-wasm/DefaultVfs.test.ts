/**
 * The default VFS {@link createSqliteWasm} registers in loading step 7, on the
 * pinned binary.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertFalse,
  assertNotEqual,
  assertOk,
  assertSame,
  assertTrue,
  getOrThrow,
  Millis,
  testCreateDeps,
  testCreateTime,
  type RandomBytes,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { test } from "node:test";
import {
  sqlite3_close_v2,
  sqlite3_config,
  sqlite3_open_v2,
  sqlite3_shutdown,
  sqlite3_vfs_find,
} from "../../../../packages/sqlite-wasm/src/CApi.ts";
import {
  SQLITE_ACCESS_EXISTS,
  SQLITE_CANTOPEN,
  SQLITE_CONFIG_URI,
  SQLITE_ERROR,
  SQLITE_IOERR_DELETE_NOENT,
  SQLITE_OK,
  SQLITE_OPEN_CREATE,
  SQLITE_OPEN_READONLY,
  SQLITE_OPEN_READWRITE,
  sqlite3_file_layout,
  sqlite3_vfs_layout,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type {
  CStringPtr,
  SqliteDbPtr,
  WasmPtr,
} from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import {
  initializeSqliteWasm,
  type createSqliteWasm,
} from "../../../../packages/sqlite-wasm/src/Wasm.ts";
import { setupSahPool } from "./_sahPool.ts";
import { setupDatabase } from "./_sqliteWasm.ts";

const { members } = sqlite3_vfs_layout;

/**
 * A `:memory:` database on a fresh instance, with the `evolu-memory` VFS and a
 * function that calls its methods through the function table.
 */
const setupDefaultVfs = async (deps?: TestRunDefaultDeps) => {
  const t = await setupDatabase(deps);
  const vfs = sqlite3_vfs_find(t)(t.cString("evolu-memory"));
  assert(vfs !== 0, "evolu-memory is not registered");

  const callMethod = (
    name: keyof typeof members,
    ...args: ReadonlyArray<number | bigint>
  ): number => {
    const method: unknown = t.sqliteWasm.functionTable.get(
      t.readPtr((vfs + members[name].offset) as WasmPtr),
    );
    assert(typeof method === "function", `${name} is NULL`);
    return (method as (...args: ReadonlyArray<unknown>) => number)(
      vfs,
      ...args,
    );
  };

  return { ...t, vfs, callMethod };
};

test("createSqliteWasm registers evolu-memory as the default VFS, of version 2, with its file size and maximum path length", async () => {
  const t = await setupDatabase();

  const vfs = sqlite3_vfs_find(t)(0);

  assert(vfs !== 0, "no default VFS");
  assertEqual(
    t.text(t.readPtr((vfs + members.zName.offset) as WasmPtr) as CStringPtr),
    "evolu-memory",
  );
  assertEqual(t.readPtr((vfs + members.iVersion.offset) as WasmPtr), 2);
  assertEqual(
    t.readPtr((vfs + members.szOsFile.offset) as WasmPtr),
    sqlite3_file_layout.sizeof,
  );
  assertEqual(t.readPtr((vfs + members.mxPathname.offset) as WasmPtr), 1024);
});

test("initializeSqliteWasm after sqlite3_shutdown restores evolu-memory and RandomBytes seeding", async () => {
  const time = testCreateTime({ startAt: Millis.orThrow(1_790_000_000_000) });
  const setup = async (byte: number) => {
    const randomBytes = {
      create: (length: number) => new Uint8Array(length).fill(byte),
    } as RandomBytes;
    const t = await setupDatabase({ ...testCreateDeps(), randomBytes, time });
    assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);
    assertEqual(sqlite3_shutdown(t)(), SQLITE_OK);
    assertEqual(sqlite3_config(t)(SQLITE_CONFIG_URI, 1), SQLITE_OK);

    assertOk(initializeSqliteWasm(t)());

    const vfs = sqlite3_vfs_find(t)(0);
    assert(vfs !== 0, "no default VFS");
    assertEqual(
      t.text(t.readPtr((vfs + members.zName.offset) as WasmPtr) as CStringPtr),
      "evolu-memory",
    );
    const { db } = t.open(":memory:");
    return t.selectText("select hex(randomblob(8))", db);
  };

  // The unix VFS would seed both from the same time and pid.
  assertNotEqual(await setup(1), await setup(2));
});

// sqlite3_initialize registers SQLite's kvvfs, whose storage only SQLite's
// JavaScript provides, and sqlite3_open_v2 opens the names :localStorage: and
// :sessionStorage: on it, whatever VFS it is given.
const kvvfsNames = [
  ":localStorage:",
  ":sessionStorage:",
  "file:local?vfs=kvvfs",
] as const;

test("kvvfs is not registered, so its URI and the names :localStorage: and :sessionStorage: fail to open with SQLITE_ERROR, which SqliteVfsPath rejects as the path of a File database, and the instance keeps working", async () => {
  const t = await setupSahPool();

  assertEqual(sqlite3_vfs_find(t)(t.cString("kvvfs")), 0);
  for (const name of kvvfsNames) {
    const { rc, db } = t.open(name);
    assertEqual([rc, t.errmsg(db)], [SQLITE_ERROR, "no such vfs: kvvfs"]);
    assertEqual(sqlite3_close_v2(t)(db), SQLITE_OK);
    assertErr(SqliteVfsPath.from.parent(name), {
      type: "SqliteVfsPath",
      value: name,
    });
  }

  assertFalse(t.sqliteWasm.isBroken());
  using database = getOrThrow(
    createSqliteDatabase(t)({
      type: "File",
      vfs: t.pool,
      path: SqliteVfsPath.orThrow("/evolu1.db"),
    }),
  );
  assertOk(database.exec("CREATE TABLE t(a)"));
  assertEqual(t.reportDefect.getDefects(), []);
});

test("initializeSqliteWasm after sqlite3_shutdown leaves kvvfs unregistered", async () => {
  const t = await setupDatabase();
  assertEqual(sqlite3_close_v2(t)(t.db), SQLITE_OK);
  assertEqual(sqlite3_shutdown(t)(), SQLITE_OK);

  assertOk(initializeSqliteWasm(t)());

  assertEqual(sqlite3_vfs_find(t)(t.cString("kvvfs")), 0);
  const { rc, db } = t.open(":localStorage:");
  assertEqual([rc, t.errmsg(db)], [SQLITE_ERROR, "no such vfs: kvvfs"]);
});

test("a file path on the default VFS fails with SQLITE_CANTOPEN", async () => {
  const t = await setupDatabase();

  for (const zVfs of [0, t.cString("evolu-memory")] as const)
    for (const flags of [
      SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE,
      SQLITE_OPEN_READONLY,
    ]) {
      const rc = sqlite3_open_v2(t)(
        t.cString("/evolu.db"),
        t.scratch.out,
        flags,
        zVfs,
      );
      const db = t.readPtr(t.scratch.out) as SqliteDbPtr;

      assertEqual(
        [rc, t.errmsg(db)],
        [SQLITE_CANTOPEN, "unable to open database file"],
      );
      sqlite3_close_v2(t)(db);
    }
});

test("the default VFS's clocks read Time's wall-clock time as a Julian day", async () => {
  const t = await setupDefaultVfs({
    ...testCreateDeps(),
    time: testCreateTime({ startAt: Millis.orThrow(1_790_000_000_123) }),
  });
  const pTime = getOrThrow(allocWasm(t)(8));
  const view = () => t.sqliteWasm.getHeapDataView();

  assertEqual(t.callMethod("xCurrentTimeInt64", pTime), SQLITE_OK);
  // Milliseconds since noon in Greenwich on November 24, 4714 BC.
  assertEqual(
    view().getBigInt64(pTime, true),
    1_790_000_000_123n + 210_866_760_000_000n,
  );

  assertEqual(t.callMethod("xCurrentTime", pTime), SQLITE_OK);
  assertEqual(
    view().getFloat64(pTime, true),
    1_790_000_000_123 / 86_400_000 + 2_440_587.5,
  );
});

test("instances with different RandomBytes produce different randomblob values", async () => {
  const first = await setupDatabase(testCreateDeps({ seed: "first" }));
  const second = await setupDatabase(testCreateDeps({ seed: "second" }));
  const sql = "select hex(randomblob(16))";

  assertNotEqual(first.selectText(sql), second.selectText(sql));
});

test("instances with the same RandomBytes reproduce randomblob values, seeded with 44 bytes", async () => {
  const setup = async () => {
    const deps = testCreateDeps({ seed: "same" });
    const requestedLengths: Array<number> = [];
    const randomBytes = {
      create: (length: number) => {
        requestedLengths.push(length);
        return deps.randomBytes.create(length);
      },
    } as RandomBytes;
    const t = await setupDatabase({ ...deps, randomBytes });
    return { ...t, requestedLengths };
  };
  const first = await setup();
  const second = await setup();
  const sql = "select hex(randomblob(16))";

  assertEqual(first.selectText(sql), second.selectText(sql));
  // SQLite seeds its ChaCha20 generator from the default VFS's xRandomness.
  assertTrue(first.requestedLengths.includes(44));
});

test("the default VFS's methods report what they throw to the Run's ReportDefect", async () => {
  const deps = testCreateDeps();
  const error = new Error("no entropy");
  const randomBytes = {
    create: (length: number) => {
      if (length === 44) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const t = await setupDatabase({ ...deps, randomBytes });

  // SQLite seeds its generator from xRandomness when it first needs it.
  t.selectText("select hex(randomblob(8))");

  const defects = t.reportDefect.getDefects();
  assertEqual(defects.length, 1);
  assertSame(defects[0], error);
});

test("the default VFS's xRandomness fills memory from RandomBytes in chunks of at most 65536 bytes", async () => {
  const deps = testCreateDeps();
  const created: Array<Uint8Array> = [];
  const randomBytes = {
    create: (length: number) => {
      const bytes = deps.randomBytes.create(length);
      created.push(bytes);
      return bytes;
    },
  } as RandomBytes;
  const t = await setupDefaultVfs({ ...deps, randomBytes });
  const byteLength = 150_000;
  const pOut = getOrThrow(allocWasm(t)(byteLength));
  created.length = 0;

  assertEqual(t.callMethod("xRandomness", byteLength, pOut), byteLength);

  assertEqual(
    created.map((bytes) => bytes.length),
    [65_536, 65_536, 18_928],
  );
  assertEqual(
    t.sqliteWasm.getHeapU8().slice(pOut, pOut + byteLength),
    Uint8Array.from(created.flatMap((bytes) => [...bytes])),
  );
});

test("the default VFS's xSleep returns at once, having slept 0 microseconds", async () => {
  const time = testCreateTime();
  const t = await setupDefaultVfs({ ...testCreateDeps(), time });
  const before = time.performance.now();

  assertEqual(t.callMethod("xSleep", 1_000_000), 0);

  assertEqual(time.performance.now(), before);
});

test("the default VFS has no files: xAccess finds none, xDelete has none to delete, xFullPathname fails", async () => {
  const t = await setupDefaultVfs();
  const zName = t.cString("/evolu.db");
  const pResOut = getOrThrow(allocWasm(t)(4));
  const zOut = getOrThrow(allocWasm(t)(1025));
  t.sqliteWasm.getHeapDataView().setInt32(pResOut, 1, true);

  assertEqual(
    t.callMethod("xAccess", zName, SQLITE_ACCESS_EXISTS, pResOut),
    SQLITE_OK,
  );
  assertEqual(t.readPtr(pResOut), 0);
  assertEqual(t.callMethod("xDelete", zName, 1), SQLITE_IOERR_DELETE_NOENT);
  assertEqual(
    t.callMethod("xFullPathname", zName, 1025, zOut),
    SQLITE_CANTOPEN,
  );
  // SQLite records the system error of a failed open, and there is none.
  assertEqual(t.callMethod("xGetLastError", 0, 0), 0);
});
