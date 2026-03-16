import BetterSQLite, { type Statement } from "better-sqlite3";
import { timingSafeEqual } from "crypto";
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
import {
  createPreparedStatementsCache,
  testCreateRunWithSqlite,
} from "../src/Sqlite.js";
import type { Run } from "../src/Task.js";
import type { TestDeps } from "../src/Test.js";

export const testTimingSafeEqual: TimingSafeEqual = timingSafeEqual;

export const testCreateSqliteDeps: CreateSqliteDriverDep = {
  createSqliteDriver: (name) =>
    createBetterSqliteDriver(name, { mode: "memory" }),
};

// Duplicated from @evolu/nodejs because @evolu/common cannot depend on it
// (nodejs depends on common — importing back would create a circular dependency).
const createBetterSqliteDriver: CreateSqliteDriver = (name, options) => () => {
  const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
  const stack = new globalThis.DisposableStack();
  const db = stack.adopt(new BetterSQLite(filename), (db) => {
    db.close();
  });

  const cache = stack.use(
    createPreparedStatementsCache<Statement>(
      (sql) => db.prepare(sql),
      // Not needed.
      // https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#class-statement
      lazyVoid,
    ),
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

    export: () => {
      const file = db.serialize();
      const { buffer } = file;

      if (buffer instanceof ArrayBuffer) {
        return new Uint8Array(buffer, file.byteOffset, file.byteLength);
      }

      // Ensure export uses transferable ArrayBuffer backing.
      return new Uint8Array(file);
    },

    [Symbol.dispose]: () => {
      stack.dispose();
    },
  };

  return ok(driver);
};

/** Creates a test Run with relay storage and SQLite deps. */
export const testCreateRunWithSqliteAndRelayStorage = async (
  config?: Partial<StorageConfig>,
): Promise<Run<TestDeps & CreateSqliteDriverDep & SqliteDep & StorageDep>> => {
  const runWithSqlite = await testCreateRunWithSqlite(testCreateSqliteDeps);

  createBaseSqliteStorageTables(runWithSqlite.deps);
  createRelayStorageTables(runWithSqlite.deps);

  const storage = createRelaySqliteStorage({
    ...runWithSqlite.deps,
    timingSafeEqual: testTimingSafeEqual,
  })({
    isOwnerWithinQuota: lazyTrue,
    ...config,
  });

  return runWithSqlite.addDeps<StorageDep>({ storage });
};
