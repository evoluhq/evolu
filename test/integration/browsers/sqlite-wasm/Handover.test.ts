/**
 * Handing a `SahPool` from one worker to another on real OPFS in Chromium,
 * Firefox and WebKit: pausing it, holding it, and the end of a worker.
 *
 * Only one worker can hold a pool. The first test follows SQLite's pausing
 * test, `ext/wasm/tests/opfs/sahpool/sahpool-pausing.js` with
 * `sahpool-worker.js` (SQLite 3.53.4, public domain), where disposing a pool
 * pauses it and opening its directory again unpauses it. The others follow
 * `@evolu/web`'s tests of a worker that ended, which serialize workers with a
 * Web Lock as Evolu does.
 */

import { assertEqual, assertErr, assertOk } from "@evolu/common";
import { test } from "vitest";
import type { OpfsName } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import {
  okOrThrow,
  readSlots,
  setupPoolDirectory,
  setupSqliteWorker,
  type SqliteWorker,
} from "./_harness.ts";

// sahpool-pausing.js runPyramidOfDoom: W1 acquires the VFS, creates mytable,
// queries it and pauses; W2 acquires the VFS and queries the same rows. Added:
// each worker is held off while the other holds the pool.
test("a second worker is held off while the first holds the pool, writing nothing, takes it over once the first disposes it, and the first unpauses it once the second disposes it", async () => {
  await using pool = setupPoolDirectory();
  using first = await setupSqliteWorker();
  using second = await setupSqliteWorker();
  const { vfsName } = okOrThrow(await first.run("openPool", pool.directory));
  const created = okOrThrow(
    await first.run("openDatabase", pool.directory, "/my.db"),
  );
  assertOk(
    await first.run(
      "exec",
      created,
      "CREATE TABLE mytable(a); INSERT INTO mytable(a) VALUES (11), (22), (33)",
    ),
  );
  const selectSql = "SELECT a FROM mytable ORDER BY a";
  const rows = [{ a: 11 }, { a: 22 }, { a: 33 }];
  const before = await readSlots(pool.directory);

  const heldBySecond = await second.run("openPool", pool.directory);

  assertErr(heldBySecond);
  assertEqual(heldBySecond.error.type, "SahPoolHeldError");
  assertEqual(await readSlots(pool.directory), before);

  await first.run("disposeDatabase", created);
  await first.run("disposePool", pool.directory);
  assertOk(await second.run("openPool", pool.directory), { vfsName });
  const taken = okOrThrow(
    await second.run("openDatabase", pool.directory, "/my.db"),
  );
  assertEqual(
    okOrThrow(await second.run("run", taken, selectSql, [])).rows,
    rows,
  );

  const heldByFirst = await first.run("openPool", pool.directory);
  assertErr(heldByFirst);
  assertEqual(heldByFirst.error.type, "SahPoolHeldError");

  await second.run("disposeDatabase", taken);
  await second.run("disposePool", pool.directory);
  assertOk(await first.run("openPool", pool.directory), { vfsName });
  const unpaused = okOrThrow(
    await first.run("openDatabase", pool.directory, "/my.db"),
  );
  assertEqual(
    okOrThrow(await first.run("run", unpaused, selectSql, [])).rows,
    rows,
  );
});

/**
 * Takes the Web Lock and opens the pool in the worker, as Evolu's DbWorker
 * does, and commits a row to `/evolu1.db`, returning the database.
 */
const commitRowUnderLock = async (
  worker: SqliteWorker,
  directory: OpfsName,
  lockName: string,
  value: string,
): Promise<number> => {
  await worker.run("holdLock", lockName);
  assertOk(await worker.run("openPool", directory));
  const database = okOrThrow(
    await worker.run("openDatabase", directory, "/evolu1.db"),
  );
  assertOk(await worker.run("exec", database, "CREATE TABLE t(a)"));
  assertOk(
    await worker.run("run", database, "INSERT INTO t VALUES (?)", [value]),
  );
  return database;
};

// @evolu/web's 'reinitializes OPFS database after SQLite worker termination'.
// The Web Lock is released when the worker ends. Every engine has released an
// idle worker's handles by the time the next lock holder opens the pool, so
// heldTimeout here only tolerates a late release. The SahPoolHeldError test in
// SahPool.test.ts, which also waits with heldTimeout, and the first test here
// cover a held pool.
test("after a worker that holds the Web Lock is terminated with its database open, a new worker that takes the lock opens the pool and reads the committed row", async () => {
  await using pool = setupPoolDirectory();
  const lockName = pool.directory;
  using first = await setupSqliteWorker();
  await commitRowUnderLock(first, pool.directory, lockName, "terminated");

  first.terminate();

  await navigator.locks.request(lockName, () => undefined);
  using second = await setupSqliteWorker();
  await second.run("holdLock", lockName);
  okOrThrow(
    await second.run("openPool", pool.directory, { heldTimeout: "5s" }),
  );
  const database = okOrThrow(
    await second.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await second.run("run", database, "SELECT a FROM t", [])).rows,
    [{ a: "terminated" }],
  );
});

// @evolu/web's 'reinitializes OPFS database after SQLite worker self close'.
test("after a worker that holds the Web Lock disposes its database and pool and closes itself, a new worker that takes the lock opens the pool at once and reads the committed row", async () => {
  await using pool = setupPoolDirectory();
  const lockName = pool.directory;
  using first = await setupSqliteWorker();
  const database = await commitRowUnderLock(
    first,
    pool.directory,
    lockName,
    "closed",
  );
  await first.run("disposeDatabase", database);
  await first.run("disposePool", pool.directory);

  await first.run("closeWorker");

  await navigator.locks.request(lockName, () => undefined);
  using second = await setupSqliteWorker();
  await second.run("holdLock", lockName);
  assertOk(await second.run("openPool", pool.directory));
  const reopened = okOrThrow(
    await second.run("openDatabase", pool.directory, "/evolu1.db"),
  );
  assertEqual(
    okOrThrow(await second.run("run", reopened, "SELECT a FROM t", [])).rows,
    [{ a: "closed" }],
  );
});
