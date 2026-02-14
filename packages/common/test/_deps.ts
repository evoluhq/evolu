import BetterSQLite, { type Statement } from "better-sqlite3";
import { timingSafeEqual } from "crypto";
import { assert } from "../src/Assert.js";
import type { TimingSafeEqual } from "../src/Crypto.js";
import { lazyTrue, lazyVoid } from "../src/Function.js";
import {
  createRelaySqliteStorage,
  createRelayStorageTables,
} from "../src/local-first/Relay.js";
import {
  createBaseSqliteStorageTables,
  type StorageConfig,
  type StorageDep,
} from "../src/local-first/Storage.js";
import { ok } from "../src/Result.js";
import type {
  CreateSqliteDriver,
  CreateSqliteDriverDep,
  SqliteDep,
  SqliteDriver,
  SqliteRow,
} from "../src/Sqlite.js";
import { createPreparedStatementsCache, createSqlite } from "../src/Sqlite.js";
import type { Run } from "../src/Task.js";
import { testCreateRun, type TestDeps } from "../src/Test.js";
import { testName } from "../src/Type.js";

export const testTimingSafeEqual: TimingSafeEqual = timingSafeEqual;

export const testCreateRunWithSqlite = async (): Promise<
  Run<TestDeps & SqliteDep>
> => {
  const run = testCreateRun<CreateSqliteDriverDep>({
    createSqliteDriver: testCreateSqliteDriver,
  });

  const sqlite = await run(createSqlite(testName));
  assert(sqlite.ok, "bug");

  run.defer(() => {
    sqlite.value[Symbol.dispose]();
    return ok();
  });

  return run.addDeps({ sqlite: sqlite.value });
};

/** Creates a test Run with relay storage and SQLite deps. */
export const testCreateRunWithSqliteAndRelayStorage = async (
  config?: Partial<StorageConfig>,
): Promise<Run<TestDeps & SqliteDep & StorageDep>> => {
  const run = await testCreateRunWithSqlite();

  createBaseSqliteStorageTables(run.deps);
  createRelayStorageTables(run.deps);

  const storage = createRelaySqliteStorage({
    ...run.deps,
    timingSafeEqual: testTimingSafeEqual,
  })({
    onStorageError: (error) => {
      throw new Error(error.type);
    },
    isOwnerWithinQuota: lazyTrue,
    ...config,
  });

  return run.addDeps<StorageDep>({ storage });
};

/** In-memory better-sqlite3 driver for tests. */
const testCreateSqliteDriver: CreateSqliteDriver = (name) =>
  createBetterSqliteDriver(name, { mode: "memory" });

// Duplicated from @evolu/nodejs because @evolu/common cannot depend on it
// (nodejs depends on common — importing back would create a circular dependency).
const createBetterSqliteDriver: CreateSqliteDriver = (name, options) => () => {
  const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
  const db = new BetterSQLite(filename);
  let isDisposed = false;

  const cache = createPreparedStatementsCache<Statement>(
    (sql) => db.prepare(sql),
    // Not needed.
    // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
    lazyVoid,
  );

  const driver: SqliteDriver = {
    exec: (query) => {
      // Always prepare is recommended for better-sqlite3
      const prepared = cache.get(query, true);

      if (prepared.reader) {
        const rows = prepared.all(query.parameters) as Array<SqliteRow>;
        return { rows, changes: 0 };
      }

      const changes = prepared.run(query.parameters).changes;
      return { rows: [], changes };
    },

    export: () => db.serialize(),

    [Symbol.dispose]: () => {
      if (isDisposed) return;
      isDisposed = true;
      cache[Symbol.dispose]();
      db.close();
    },
  };

  return ok(driver);
};
