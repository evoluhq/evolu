/**
 * The C build against `@evolu/sqlite-wasm` 3.54.0-build2, the last build whose
 * pool encrypts in TypeScript, on one fake OPFS: each build opens what the
 * other wrote, as tabs of two Evolu versions sharing a pool would.
 */

import {
  assertEqual,
  assertOk,
  EncryptionKey,
  getOrThrow,
} from "@evolu/common";
import { createSqliteDatabase as tsBuildCreateSqliteDatabase } from "@evolu/sqlite-wasm-3.54.0-build2";
import { test } from "node:test";
import {
  createSqliteDatabase,
  SqliteVfsPath,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import { setupFakeOpfs } from "./_fakeOpfs.ts";
import { setupSahPool } from "./_sahPool.ts";
import { setupTsBuildPool } from "./_tsBuild.ts";

const key = EncryptionKey.orThrow(
  Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1),
);

const path = SqliteVfsPath.orThrow("/evolu1.db");

test("the TypeScript-codec build opens and extends an encrypted database the C build created in the same pool, and the C build then reads both builds' rows", async () => {
  const fake = setupFakeOpfs();
  const c = await setupSahPool({ fake });
  const created = getOrThrow(
    createSqliteDatabase(c)({ type: "EncryptedFile", vfs: c.pool, path, key }),
  );
  assertOk(created.exec("CREATE TABLE t(a); INSERT INTO t VALUES ('c')"));
  created[Symbol.dispose]();
  c.pool[Symbol.dispose]();

  const ts = await setupTsBuildPool({ fake });
  const extended = getOrThrow(
    tsBuildCreateSqliteDatabase(ts)({
      type: "EncryptedFile",
      vfs: ts.pool,
      path,
      key,
    }),
  );
  assertOk(extended.exec("INSERT INTO t VALUES ('ts')"));
  extended[Symbol.dispose]();
  ts.pool[Symbol.dispose]();

  const next = await setupSahPool({ fake });
  using database = getOrThrow(
    createSqliteDatabase(next)({
      type: "EncryptedFile",
      vfs: next.pool,
      path,
      key,
    }),
  );
  assertEqual(
    getOrThrow(database.run("SELECT a FROM t ORDER BY rowid", [])).rows,
    [{ a: "c" }, { a: "ts" }],
  );
});
