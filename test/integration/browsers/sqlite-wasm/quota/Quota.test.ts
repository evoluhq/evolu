/**
 * `SahPool` databases running out of storage quota on real OPFS: in Chromium,
 * whose quota CDP overrides, in Firefox, whose quota this project's
 * configuration fixes, and in WebKit, which cannot be quota-limited here, with
 * a quota the worker injects.
 *
 * What was measured by hand for wa-sqlite
 * (https://github.com/rhashimoto/wa-sqlite/discussions/290 and
 * https://github.com/rhashimoto/wa-sqlite/issues/336) becomes a test: a write
 * over the quota fails with SQLITE_FULL caused by what the engine, or in WebKit
 * the injected quota, reported, SQLite rolls the statement's transaction back,
 * and the database keeps working once space is freed.
 */

import {
  assert,
  assertEqual,
  assertErr,
  assertOk,
  assertTrue,
} from "@evolu/common";
import { test } from "vitest";
import { cdp, server } from "vitest/browser";
import { SQLITE_FULL } from "../../../../../packages/sqlite-wasm/src/Constants.ts";
import {
  okOrThrow,
  setupPoolDirectory,
  setupSqliteWorker,
} from "../_harness.ts";

/** The storage each test may use, which it fills. */
const quotaBytes = 8 * 1024 * 1024;

/**
 * Overrides the quota of the page's origin in Chromium through CDP, until
 * disposed.
 */
const overrideChromiumQuota = async (
  quotaSize: number,
): Promise<AsyncDisposable> => {
  const { origin } = location;
  await cdp().send("Storage.overrideQuotaForOrigin", { origin, quotaSize });
  return {
    [Symbol.asyncDispose]: async () => {
      // Without quotaSize, the override is removed.
      await cdp().send("Storage.overrideQuotaForOrigin", { origin });
    },
  };
};

/**
 * Limits the storage of the page's origin to {@link quotaBytes} more than it
 * uses, until disposed, and returns the quota to open the pool with in WebKit,
 * which the worker injects.
 */
const setupQuota = async (): Promise<
  AsyncDisposable & { readonly injectedQuota: number | undefined }
> => {
  const { usage = 0, quota = Infinity } = await navigator.storage.estimate();
  switch (server.browser) {
    case "chromium": {
      const override = await overrideChromiumQuota(usage + quotaBytes);
      return {
        injectedQuota: undefined,
        [Symbol.asyncDispose]: () => override[Symbol.asyncDispose](),
      };
    }
    case "firefox":
      // The project's configuration fixes the limit, so no test writes until
      // the disk is full.
      assert(
        quota - usage <= 2 * quotaBytes,
        `Firefox's quota is not limited: ${quota} bytes.`,
      );
      return {
        injectedQuota: undefined,
        [Symbol.asyncDispose]: async () => {},
      };
    default:
      return {
        injectedQuota: quotaBytes,
        [Symbol.asyncDispose]: async () => {},
      };
  }
};

/**
 * Removes everything in the origin's OPFS. The profile persists, and a run that
 * was killed leaves its pool directory there, which the Firefox quota, fixed
 * for the whole profile, would count. Only this test uses the profile.
 */
const removeOpfsEntries = async (): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  for (const name of await Array.fromAsync(root.keys()))
    await root.removeEntry(name, { recursive: true });
};

// Each insert is a transaction that grows the database by about 64 KiB.
const insertSql = "INSERT INTO t(v) VALUES (randomblob(65536))";

const countSql = "SELECT count(*) AS n FROM t";

test("inserts that run out of quota fail with SQLITE_FULL caused by the quota error, which the worker injects in WebKit, or by Firefox's short write, roll back and leave the database intact, and work again once another database is unlinked", async () => {
  await removeOpfsEntries();
  await using pool = setupPoolDirectory();
  using worker = await setupSqliteWorker();
  await using quota = await setupQuota();
  assertOk(
    await worker.run("openPool", pool.directory, {
      quota: quota.injectedQuota,
    }),
  );
  // Space to free later, 1 MiB.
  const ballast = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/ballast.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      ballast,
      "CREATE TABLE t(v); WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < 16) INSERT INTO t SELECT randomblob(65536) FROM c",
    ),
  );
  await worker.run("disposeDatabase", ballast);
  const database = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/test.db"),
  );
  assertOk(
    await worker.run(
      "exec",
      database,
      "CREATE TABLE t(id INTEGER PRIMARY KEY, v BLOB)",
    ),
  );

  const { runs, error } = await worker.run(
    "runUntilError",
    database,
    insertSql,
    // Twice what fits, so a quota that does not apply fails the test.
    (2 * quotaBytes) / 65536,
  );

  assert(error != null, "The inserts never ran out of quota.");
  assert(error.type === "SqliteError", "Expected a SqliteError.");
  assertTrue(runs > 0);
  assertEqual(
    [error.extendedCode, error.cause?.method],
    [SQLITE_FULL, "xWrite"],
  );
  const cause = error.cause?.error as {
    readonly name?: string;
    readonly type?: string;
    readonly requested?: number;
    readonly written?: number;
  };
  if (server.browser === "firefox") {
    // Firefox writes what fits, if anything, and returns a short count.
    assertEqual(cause.type, "SqliteShortWrite");
    assertTrue(Number(cause.written) < Number(cause.requested));
  } else assertEqual(cause.name, "QuotaExceededError");
  // SQLite rolled the failed insert's transaction back.
  assertEqual(okOrThrow(await worker.run("run", database, countSql, [])).rows, [
    { n: runs },
  ]);
  assertEqual(
    okOrThrow(await worker.run("run", database, "PRAGMA integrity_check", []))
      .rows,
    [{ integrity_check: "ok" }],
  );
  assertEqual((await worker.run("getPaths", pool.directory)).toSorted(), [
    "/ballast.db",
    "/test.db",
  ]);
  const stillFull = await worker.run("exec", database, insertSql);
  assertErr(stillFull);
  assert(stillFull.error.type === "SqliteError", "Expected a SqliteError.");
  assertEqual(stillFull.error.extendedCode, SQLITE_FULL);

  assertOk(await worker.run("unlink", pool.directory, "/ballast.db"), true);

  const afterUnlink = await worker.run("exec", database, insertSql);
  // Chromium reserves quota for a sync access handle ahead of its writes and
  // releases what the file does not use only when the handle closes, so the
  // unlinked database's quota frees once the pool is opened again.
  if (server.browser === "chromium") {
    assertErr(afterUnlink);
    assert(afterUnlink.error.type === "SqliteError", "Expected a SqliteError.");
    assertEqual(afterUnlink.error.extendedCode, SQLITE_FULL);
  } else assertOk(afterUnlink);
  await worker.run("disposeDatabase", database);
  await worker.run("disposePool", pool.directory);
  assertOk(
    await worker.run("openPool", pool.directory, {
      quota: quota.injectedQuota,
    }),
  );
  const reopened = okOrThrow(
    await worker.run("openDatabase", pool.directory, "/test.db"),
  );
  assertOk(await worker.run("exec", reopened, insertSql));
  assertEqual(okOrThrow(await worker.run("run", reopened, countSql, [])).rows, [
    { n: runs + (afterUnlink.ok ? 2 : 1) },
  ]);
});
