/**
 * The VFS File and EncryptedFile databases open on, a `SahPool`, as types.
 *
 * Every File and EncryptedFile open goes through Evolu's codec, which is
 * registered only over a pool, under the pool's name, so an object with only
 * the members a database and a driver use of a pool, each delegating to one, is
 * no VFS for them.
 */

import { assertType, EncryptionKey, type InferErr } from "@evolu/common";
import { test } from "node:test";
import {
  createEncryptedSqliteDatabase,
  createSqliteDatabase,
  SqliteVfsPath,
  type SqliteVfsIoError,
} from "../../../../packages/sqlite-wasm/src/Database.ts";
import type { SahPool } from "../../../../packages/sqlite-wasm/src/SahPool.ts";
import type { TestSahPool } from "./_sahPool.ts";

const testKey = EncryptionKey.orThrow(new Uint8Array(32).fill(7));

test("File and EncryptedFile databases, also through createEncryptedSqliteDatabase, take a SahPool, whose unlink fails with SqliteVfsIoError, and reject an object with only the members a database and a driver use of a pool, each delegating to it", () => {
  assertType<InferErr<ReturnType<SahPool["unlink"]>>, SqliteVfsIoError>();

  void ((t: TestSahPool) => {
    const vfs = {
      vfsName: t.pool.vfsName,
      getFailure: () => t.pool.getFailure(),
      clearFailure: () => {
        t.pool.clearFailure();
      },
      getPaths: () => t.pool.getPaths(),
      unlink: (path: string) => t.pool.unlink(path),
    };
    const path = SqliteVfsPath.orThrow("/evolu1.db");

    createSqliteDatabase(t)({
      type: "File",
      // @ts-expect-error A File database's vfs is a SahPool, because its open goes through Evolu's codec, which is registered only over a pool.
      vfs,
      path,
    });
    createSqliteDatabase(t)({
      type: "EncryptedFile",
      // @ts-expect-error An EncryptedFile database's vfs is a SahPool, because its open goes through Evolu's codec, which is registered only over a pool.
      vfs,
      path,
      key: testKey,
    });
    createEncryptedSqliteDatabase({
      type: "EncryptedFile",
      // @ts-expect-error createEncryptedSqliteDatabase takes a SahPool, because its open goes through Evolu's codec, which is registered only over a pool, and the fallback to the key 2.2.4 derived reads the salts with SahPool.read.
      vfs,
      path,
      key: testKey,
    });
  });
});
