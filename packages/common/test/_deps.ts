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
  SqliteRow,
} from "../src/Sqlite.js";
import {
  createPreparedStatementsCache,
  testSetupSqlite,
} from "../src/Sqlite.js";
import type { Run } from "../src/Task.js";
import type { TestDeps } from "../src/Test.js";

export const testTimingSafeEqual: TimingSafeEqual = timingSafeEqual;

export const testCreateSqliteDep: CreateSqliteDriverDep = {
  createSqliteDriver: (name) =>
    createBetterSqliteDriver(name, { mode: "memory" }),
};

export const setupSqlite: () => ReturnType<typeof testSetupSqlite> = () =>
  testSetupSqlite(testCreateSqliteDep);

// Duplicated from @evolu/nodejs because @evolu/common cannot depend on it
// (nodejs depends on common — importing back would create a circular dependency).
const createBetterSqliteDriver: CreateSqliteDriver = (name, options) => () => {
  const filename = options?.mode === "memory" ? ":memory:" : `${name}.db`;
  using stack = new DisposableStack();
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

  const moved = stack.move();

  return ok({
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
      moved.dispose();
    },
  });
};

export interface TestSqliteAndRelayStorageSetup extends AsyncDisposable {
  readonly run: Run<TestDeps & CreateSqliteDriverDep & SqliteDep & StorageDep>;
  readonly sqlite: SqliteDep["sqlite"];
  readonly storage: StorageDep["storage"];
}

/** Creates a disposable test setup with relay storage and SQLite deps. */
export const setupSqliteAndRelayStorage = async (
  config?: Partial<StorageConfig>,
): Promise<TestSqliteAndRelayStorageSetup> => {
  await using stack = new AsyncDisposableStack();
  const sqliteSetup = stack.use(await setupSqlite());
  const { run, sqlite } = sqliteSetup;

  createBaseSqliteStorageTables({ sqlite });
  createRelayStorageTables({ sqlite });

  const storage = createRelaySqliteStorage({
    ...run.deps,
    timingSafeEqual: testTimingSafeEqual,
  })({
    isOwnerWithinQuota: lazyTrue,
    ...config,
  });
  const moved = stack.move();

  return {
    run: run.addDeps<StorageDep>({ storage }),
    sqlite,
    storage,
    [Symbol.asyncDispose]: () => moved.disposeAsync(),
  };
};
