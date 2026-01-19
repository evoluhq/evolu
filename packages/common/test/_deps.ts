import type { TimingSafeEqual } from "../src/Crypto.js";
import { lazyTrue, lazyVoid } from "../src/Function.js";
import {
  createRelaySqliteStorage,
  createRelayStorageTables,
} from "../src/local-first/Relay.js";
import type { StorageConfig, StorageDep } from "../src/local-first/Storage.js";
import { createBaseSqliteStorageTables } from "../src/local-first/Storage.js";
import { createRandom } from "../src/Random.js";
import { getOrThrow } from "../src/Result.js";
import type {
  CreateSqliteDriver,
  Sqlite,
  SqliteDep,
  SqliteDriver,
  SqliteRow,
} from "../src/Sqlite.js";
import { createPreparedStatementsCache, createSqlite } from "../src/Sqlite.js";
import { SimpleName } from "../src/Type.js";

/**
 * Test dependencies.
 *
 * Provides Node-specific implementations via dynamic imports (better-sqlite3,
 * crypto.timingSafeEqual) so this file can be imported in browser tests without
 * failing.
 */

// Node.js specific: better-sqlite3 driver (dynamic import)
export const testCreateSqliteDriver: CreateSqliteDriver = async () => {
  const BetterSQLite = (await import("better-sqlite3")).default;
  type Statement = import("better-sqlite3").Statement;

  const db = new BetterSQLite(":memory:");
  let isDisposed = false;

  const cache = createPreparedStatementsCache<Statement>(
    (sql) => db.prepare(sql),
    lazyVoid,
  );

  const driver: SqliteDriver = {
    exec: (query, isMutation) => {
      const prepared = cache.get(query, true);

      const rows = isMutation
        ? []
        : (prepared.all(query.parameters) as Array<SqliteRow>);

      const changes = isMutation ? prepared.run(query.parameters).changes : 0;

      return { rows, changes };
    },

    export: () => db.serialize(),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache[Symbol.dispose]();
      db.close();
    },
  };

  return driver;
};

export const testSimpleName = SimpleName.orThrow("Test");

export const testCreateSqlite = async (): Promise<Sqlite> => {
  const sqlite = await createSqlite({
    createSqliteDriver: testCreateSqliteDriver,
  })(testSimpleName);
  return getOrThrow(sqlite);
};

// Node.js specific: crypto.timingSafeEqual (dynamic import)
export const testCreateTimingSafeEqual = async (): Promise<TimingSafeEqual> => {
  const crypto = await import("crypto");
  return crypto.timingSafeEqual;
};

export const testCreateRelayStorageAndSqliteDeps = async (
  config?: Partial<StorageConfig>,
): Promise<StorageDep & SqliteDep> => {
  const sqlite = await testCreateSqlite();

  getOrThrow(createBaseSqliteStorageTables({ sqlite }));
  getOrThrow(createRelayStorageTables({ sqlite }));

  const storage = createRelaySqliteStorage({
    sqlite,
    random: createRandom(),
    timingSafeEqual: await testCreateTimingSafeEqual(),
  })({
    onStorageError: (error) => {
      throw new Error(error.type);
    },
    isOwnerWithinQuota: lazyTrue,
    ...config,
  });

  return { sqlite, storage };
};
