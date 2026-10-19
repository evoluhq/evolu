/**
 * The bindings of Evolu's C core that `src/EvoluCApi.ts` generates, on the
 * pinned binary.
 */

import {
  assertEqual,
  assertErr,
  assertInstanceOf,
  assertSame,
  assertTrue,
  getOrThrow,
  testCreateDeps,
  testCreateReportDefect,
  trySync,
  type RandomBytes,
  type TestRunDefaultDeps,
} from "@evolu/common";
import { test } from "node:test";
import {
  SQLITE_IOERR_WRITE,
  SQLITE_MISUSE,
  SQLITE_OK,
} from "../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  evolu_codec_open,
  evolu_codec_register,
  evolu_codec_take_failure,
  evolu_skiplist_register,
} from "../../../../packages/sqlite-wasm/src/EvoluCApi.ts";
import { allocWasm } from "../../../../packages/sqlite-wasm/src/Memory.ts";
import type { SqliteDbPtr } from "../../../../packages/sqlite-wasm/src/Pointer.ts";
import { setupSahPool } from "./_sahPool.ts";
import { setupDatabase, trapEveryOpen } from "./_sqliteWasm.ts";

test("evolu_skiplist_register registers the core's SQL functions on a connection", async () => {
  const t = await setupDatabase();

  assertEqual(evolu_skiplist_register(t)(t.db), SQLITE_OK);
  assertEqual(t.selectText("SELECT evolu_core_version()"), "1");
});

test("evolu_codec_take_failure fails with SQLITE_MISUSE for a NULL connection", async () => {
  const t = await setupDatabase();
  const failure = getOrThrow(allocWasm(t)(8));

  assertEqual(evolu_codec_take_failure(t)(0, failure), SQLITE_MISUSE);
});

test("a keyed database on a codec VFS over the pool draws its IVs through random_get, and a write whose random source throws fails with a RANDOM failure", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  const failure = getOrThrow(allocWasm(t)(8));
  const readFailure = () => {
    const view = t.sqliteWasm.getHeapDataView();
    return [view.getInt32(failure, true), view.getUint32(failure + 4, true)];
  };

  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  // EVOLU_CODEC_FAILURE_NONE.
  assertEqual(readFailure(), [0, 0]);

  isRandomFailing = true;
  assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_IOERR_WRITE);
  isRandomFailing = false;

  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  // EVOLU_CODEC_FAILURE_RANDOM.
  assertEqual(readFailure(), [3, 0]);
  assertEqual(t.reportDefect.getDefects(), [error]);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "0");
});

test("a write whose random source throws after a nested call broke the instance lets what it threw unwind, unreported", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  const caught: Array<unknown> = [];
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (!isRandomFailing) return deps.randomBytes.create(length);
      try {
        t.sqliteWasm.call(() => t.open(":memory:"));
      } catch (thrown) {
        caught.push(thrown);
      }
      throw error;
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  trapEveryOpen(t);

  isRandomFailing = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertSame(outer.error, error);
  assertEqual(t.reportDefect.getDefects(), []);
});

test("a write whose random source returns bytes after catching what a nested call that broke the instance threw makes the outer call throw the refusal before any more VFS work", async () => {
  const deps = testCreateDeps();
  const caught: Array<unknown> = [];
  let opfsCallsWhenBroken = -1;
  let isBreaking = false;
  const randomBytes = {
    create: (length: number) => {
      if (isBreaking) {
        isBreaking = false;
        try {
          t.sqliteWasm.call(() => t.open(":memory:"));
        } catch (thrown) {
          caught.push(thrown);
        }
        opfsCallsWhenBroken = t.fake.calls.length;
      }
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });
  trapEveryOpen(t);

  isBreaking = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[0]);
  assertEqual(t.fake.calls.length, opfsCallsWhenBroken);
  assertEqual(t.reportDefect.getDefects(), []);
});

test("a write whose random source grows the memory with a nested allocation writes", async () => {
  const deps = testCreateDeps();
  let isGrowing = false;
  let didGrow = false;
  const randomBytes = {
    create: (length: number) => {
      if (isGrowing) {
        isGrowing = false;
        const before = t.sqliteWasm.getHeapU8().byteLength;
        const ptr = getOrThrow(allocWasm(t)(32 * 1024 * 1024));
        didGrow = t.sqliteWasm.getHeapU8().byteLength > before;
        t.sqliteWasm.exports.sqlite3_free(ptr);
      }
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const { t, db } = await setupKeyedDatabase({ ...deps, randomBytes });

  isGrowing = true;
  assertEqual(t.exec("INSERT INTO t VALUES (1)", db), SQLITE_OK);

  assertTrue(didGrow);
  assertEqual(t.reportDefect.getDefects(), []);
  assertEqual(t.selectText("SELECT count(*) FROM t", db), "1");
});

// Evolu's ReportDefect calls no SQLite, but a custom one can, and break the
// instance itself.
test("a write whose random source throws, with a ReportDefect that breaks the instance, makes the outer call throw the refusal, caused by what broke it, before the core resumes", async () => {
  const error = new Error("no randomness");
  const deps = testCreateDeps();
  const reported: Array<unknown> = [];
  const caught: Array<unknown> = [];
  let isRandomFailing = false;
  const randomBytes = {
    create: (length: number) => {
      if (isRandomFailing) throw error;
      return deps.randomBytes.create(length);
    },
  } as RandomBytes;
  const reportDefect = Object.assign((defect: unknown) => {
    reported.push(defect);
    try {
      t.sqliteWasm.call(() => t.open(":memory:"));
    } catch (thrown) {
      caught.push(thrown);
    }
  }, testCreateReportDefect());
  const { t, db } = await setupKeyedDatabase({
    ...deps,
    randomBytes,
    reportDefect,
  });
  const failure = getOrThrow(allocWasm(t)(8));
  trapEveryOpen(t);

  isRandomFailing = true;
  const outer = trySync(
    () => t.sqliteWasm.call(() => t.exec("INSERT INTO t VALUES (1)", db)),
    (thrown) => thrown,
  );

  assertEqual(reported, [error]);
  assertEqual(caught.length, 1);
  assertInstanceOf(caught[0], WebAssembly.RuntimeError);
  assertErr(outer);
  assertInstanceOf(outer.error, Error);
  assertEqual(
    outer.error.message,
    "The SQLite wasm instance is broken: an exception escaped a wasm call.",
  );
  assertSame(outer.error.cause, caught[0]);
  // No C ran after random_get, so the codec recorded no failure for the write.
  // The binding calls the export directly, past the refusal.
  assertEqual(evolu_codec_take_failure(t)(db, failure), SQLITE_OK);
  const view = t.sqliteWasm.getHeapDataView();
  assertEqual(
    [view.getInt32(failure, true), view.getUint32(failure + 4, true)],
    [0, 0],
  );
});

/**
 * Opens a keyed database with a table on a codec VFS over a pool on a fake
 * OPFS, on a fresh instance with the given dependencies.
 */
const setupKeyedDatabase = async (deps: TestRunDefaultDeps) => {
  const t = await setupSahPool({ deps });
  const key = getOrThrow(allocWasm(t)(32));
  t.sqliteWasm.getHeapU8().fill(7, key, key + 32);
  assertEqual(
    evolu_codec_register(t)(
      t.cString("evolu-codec"),
      t.cString(t.pool.vfsName),
    ),
    SQLITE_OK,
  );
  assertEqual(
    evolu_codec_open(t)(
      t.cString("/test.db"),
      t.scratch.out,
      t.cString("evolu-codec"),
      key,
      0,
    ),
    SQLITE_OK,
  );
  const db = t.readPtr(t.scratch.out) as SqliteDbPtr;
  assertEqual(t.exec("CREATE TABLE t (x)", db), SQLITE_OK);
  return { t, db };
};
