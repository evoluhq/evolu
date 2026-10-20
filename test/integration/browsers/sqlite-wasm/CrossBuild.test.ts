/**
 * The C build against `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose
 * pool encrypts in TypeScript, on real OPFS in Chromium, Firefox and WebKit:
 * each build opens what the other wrote, as tabs of two Evolu versions sharing
 * a pool would.
 *
 * `test/integration/nodejs/sqlite-wasm/CrossBuild.test.ts` covers the builds
 * over a fake OPFS.
 */

import { assertEqual, assertErr, assertOk, EncryptionKey } from "@evolu/common";
import { test } from "vitest";
import {
  okOrThrow,
  setupPoolDirectory,
  setupSqliteWorker,
} from "./_harness.ts";

const testKey = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

// Only the C build refuses keying pragmas. 3.54.0-build2 leaves them to
// SQLite, which ignores them.
test("a worker of 3.54.0-build2, which lets SQLite ignore PRAGMA key, opens and extends an encrypted database the C build created in the same pool, and the C build then reads both builds' rows", async () => {
  await using pool = setupPoolDirectory();
  {
    using c = await setupSqliteWorker();
    assertOk(await c.run("openPool", pool.directory));
    const database = okOrThrow(
      await c.run(
        "openEncryptedDatabase",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertErr(await c.run("exec", database, "PRAGMA key = 'k'"));
    assertOk(
      await c.run(
        "exec",
        database,
        "CREATE TABLE t(a); INSERT INTO t VALUES ('c')",
      ),
    );
    await c.run("disposeDatabase", database);
    await c.run("disposePool", pool.directory);
  }
  {
    using ts = await setupSqliteWorker({ build: "3.54.0-build2" });
    assertOk(await ts.run("openPool", pool.directory));
    const database = okOrThrow(
      await ts.run(
        "openEncryptedDatabase",
        pool.directory,
        "/evolu1.db",
        testKey,
      ),
    );
    assertOk(await ts.run("exec", database, "PRAGMA key = 'k'"));
    assertOk(await ts.run("exec", database, "INSERT INTO t VALUES ('ts')"));
    await ts.run("disposeDatabase", database);
    await ts.run("disposePool", pool.directory);
  }
  using c = await setupSqliteWorker();
  okOrThrow(await c.run("openPool", pool.directory));
  const database = okOrThrow(
    await c.run("openEncryptedDatabase", pool.directory, "/evolu1.db", testKey),
  );

  assertEqual(
    okOrThrow(
      await c.run("run", database, "SELECT a FROM t ORDER BY rowid", []),
    ).rows,
    [{ a: "c" }, { a: "ts" }],
  );
});
