import {
  createBetterSqliteDriver,
  createTimingSafeEqual,
} from "../../../packages/nodejs/src/index.ts";
import type { TimingSafeEqual } from "../../../packages/common/src/Crypto.ts";
import { lazyTrue } from "../../../packages/common/src/Function.ts";
import {
  createRelaySqliteStorage,
  createRelayStorageTables,
} from "../../../packages/common/src/local-first/Relay.ts";
import {
  createBaseSqliteStorageTables,
  type StorageConfig,
  type StorageDep,
} from "../../../packages/common/src/local-first/Storage.ts";
import type {
  CreateSqliteDriverDep,
  SqliteDep,
} from "../../../packages/common/src/Sqlite.ts";
import { testSetupSqlite } from "../../../packages/common/src/Sqlite.ts";
import type { DisposableRun } from "../../../packages/common/src/Task.ts";

export const testTimingSafeEqual: TimingSafeEqual =
  /*#__PURE__*/ createTimingSafeEqual();

export const testCreateSqliteDep: CreateSqliteDriverDep = {
  createSqliteDriver: (name) =>
    createBetterSqliteDriver(name, { mode: "memory" }),
};

export const setupSqlite: () => ReturnType<typeof testSetupSqlite> = () =>
  testSetupSqlite(testCreateSqliteDep);

export interface TestSqliteAndRelayStorageSetup extends AsyncDisposable {
  readonly run: DisposableRun<StorageDep>;
  readonly sqlite: SqliteDep["sqlite"];
  readonly storage: StorageDep["storage"];
}

/** Creates a disposable test setup with relay storage and SQLite deps. */
export const setupSqliteAndRelayStorage = async (
  config?: Partial<StorageConfig>,
): Promise<TestSqliteAndRelayStorageSetup> => {
  await using disposer = new AsyncDisposableStack();
  const sqliteSetup = disposer.use(await setupSqlite());
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
  const runWithStorage = disposer.use(run.create({ storage }));
  const disposables = disposer.move();

  return {
    run: runWithStorage,
    sqlite,
    storage,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  };
};
