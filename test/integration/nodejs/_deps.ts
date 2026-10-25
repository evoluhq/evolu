import { resolve } from "node:path";
import type { TimingSafeEqual } from "../../../packages/common/src/Crypto.ts";
import { constTrue } from "../../../packages/common/src/Function.ts";
import {
  createRelaySqliteStorage,
  createRelayStorageTables,
} from "../../../packages/common/src/local-first/Relay.ts";
import {
  createBaseSqliteStorageTables,
  type StorageConfig,
  type StorageDep,
} from "../../../packages/common/src/local-first/Storage.ts";
import {
  createTimestamp,
  maxCounter,
  maxNodeId,
  orderTimestampBytes,
  timestampToTimestampBytes,
  type Counter,
  type NodeId,
  type TimestampBytes,
} from "../../../packages/common/src/local-first/Timestamp.ts";
import {
  createNativeSqliteDriver,
  type NativeSqlite,
} from "../../../packages/common/src/NativeSqlite.ts";
import type { RandomLibDep } from "../../../packages/common/src/Random.ts";
import type {
  CreateSqliteDriverDep,
  Sqlite,
  SqliteDep,
  SqliteExecResult,
  SqliteQuery,
  SqliteRow,
  SqlTemplateParam,
} from "../../../packages/common/src/Sqlite.ts";
import { sql, testSetupSqlite } from "../../../packages/common/src/Sqlite.ts";
import type { DisposableRun } from "../../../packages/common/src/Task.ts";
import { maxMillis, type Millis } from "../../../packages/common/src/Time.ts";
import { createTimingSafeEqual } from "../../../packages/nodejs/src/Crypto.ts";
import { setupAddon } from "../../../packages/sqlite-core/test/setup-addon.mts";

export interface TestTimestampBytesFixtures {
  readonly testAnotherTimestampsAsc: ReadonlyArray<TimestampBytes>;
  readonly testTimestampsAsc: ReadonlyArray<TimestampBytes>;
  readonly testTimestampsDesc: ReadonlyArray<TimestampBytes>;
  readonly testTimestampsRandom: ReadonlyArray<TimestampBytes>;
}

export const testCreateTimestampBytesFixtures = (
  deps: RandomLibDep,
): TestTimestampBytesFixtures => {
  const numberOfTimestamps = 7000;
  const oneYearMillis = 365 * 24 * 60 * 60 * 1000;
  const counterByMillis = new Map<Millis, Counter>();
  const timestamps: Array<[Millis, Counter, NodeId]> = [];

  for (let i = 0; i < numberOfTimestamps; i++) {
    const previous = timestamps.at(-1);
    // Some timestamps share the millis of the previous one, as when the clock
    // does not advance between changes.
    const millis =
      previous && deps.randomLib.next() < 0.3
        ? previous[0]
        : (deps.randomLib.int(0, oneYearMillis) as Millis);
    const lastCounter = counterByMillis.get(millis);
    let counter: Counter;

    if (lastCounter !== undefined) {
      counter = (lastCounter + 1) as Counter;
    } else if (deps.randomLib.next() < 0.02) {
      // A counter encoded in two or three bytes, leaving room for every later
      // timestamp with the same millis.
      counter = deps.randomLib.int(
        128,
        maxCounter - numberOfTimestamps,
      ) as Counter;
    } else {
      counter = 0 as Counter;
    }

    const nodeId = (
      deps.randomLib.next() > 0.8 ? "99c99028d6636a91" : "68a2a7bf3f85a096"
    ) as NodeId;
    counterByMillis.set(millis, counter);
    timestamps.push([millis, counter, nodeId]);
  }

  const testTimestampsAsc = timestamps
    .map(([millis, counter, nodeId]) =>
      timestampToTimestampBytes(createTimestamp({ millis, counter, nodeId })),
    )
    .toSorted(orderTimestampBytes)
    // Reserve two positions for the minimum and maximum timestamps.
    .slice(0, 5000 - 2);

  testTimestampsAsc.unshift(timestampToTimestampBytes(createTimestamp()));
  testTimestampsAsc.push(
    timestampToTimestampBytes(
      createTimestamp({
        millis: maxMillis,
        counter: maxCounter,
        nodeId: maxNodeId,
      }),
    ),
  );

  const testTimestampsDesc = testTimestampsAsc.toReversed();
  const testTimestampsRandom = deps.randomLib.shuffle(testTimestampsAsc);
  const testAnotherTimestampsAsc = timestamps
    .map(([millis, counter, nodeId]) =>
      timestampToTimestampBytes(
        createTimestamp({
          millis: (millis + 1) as Millis,
          counter,
          nodeId: nodeId.replaceAll("9", "8") as NodeId,
        }),
      ),
    )
    .toSorted(orderTimestampBytes)
    .slice(0, 1000);

  return {
    testAnotherTimestampsAsc,
    testTimestampsAsc,
    testTimestampsDesc,
    testTimestampsRandom,
  };
};

export const testTimingSafeEqual: TimingSafeEqual =
  /*#__PURE__*/ createTimingSafeEqual();

/** Evolu's SQLite core, through the test addon that `setupAddon` builds. */
const testNativeSqlite = (await setupAddon()).createBinding() as NativeSqlite;

/** Opens every database in memory, on Evolu's SQLite core. */
export const testCreateSqliteDep: CreateSqliteDriverDep = {
  createSqliteDriver: (name) =>
    createNativeSqliteDriver({
      nativeSqlite: testNativeSqlite,
      // As @evolu/nodejs names a database's file, which no test opens.
      databasePath: (databaseName) => resolve(`${databaseName}.db`),
    })(name, { mode: "memory" }),
};

export const setupSqlite: () => ReturnType<typeof testSetupSqlite> = () =>
  testSetupSqlite(testCreateSqliteDep);

/**
 * Wraps a {@link Sqlite} so that `intercept` gets each query that `exec` or
 * `prepared` runs, with `run` that runs it, and returns what `intercept`
 * returns.
 */
export const setupInterceptedSqlite = (
  sqlite: Sqlite,
  intercept: (
    query: SqliteQuery,
    run: () => SqliteExecResult,
  ) => SqliteExecResult,
): Sqlite => ({
  ...sqlite,
  exec: <R extends SqliteRow = SqliteRow>(query: SqliteQuery) =>
    intercept(query, () => sqlite.exec(query)) as SqliteExecResult<R>,
  prepared: <R extends SqliteRow = SqliteRow>(
    strings: TemplateStringsArray,
    ...parameters: Array<SqlTemplateParam>
  ) =>
    intercept(sql(strings, ...parameters), () =>
      sqlite.prepared(strings, ...parameters),
    ) as SqliteExecResult<R>,
});

export interface TestSqliteAndRelayStorageSetup extends AsyncDisposable {
  readonly run: DisposableRun<StorageDep>;
  readonly sqlite: SqliteDep["sqlite"];
  readonly storage: StorageDep["storage"];
}

/**
 * Creates a disposable test setup with relay storage and SQLite deps, on the
 * driver of {@link testCreateSqliteDep} unless `deps` passes another.
 */
export const setupSqliteAndRelayStorage = async (
  config?: Partial<StorageConfig>,
  deps: CreateSqliteDriverDep = testCreateSqliteDep,
): Promise<TestSqliteAndRelayStorageSetup> => {
  await using disposer = new AsyncDisposableStack();
  const sqliteSetup = disposer.use(await testSetupSqlite(deps));
  const { run, sqlite } = sqliteSetup;

  createBaseSqliteStorageTables({ sqlite });
  createRelayStorageTables({ sqlite });

  const storage = createRelaySqliteStorage({
    ...run.deps,
    timingSafeEqual: testTimingSafeEqual,
  })({
    isOwnerWithinQuota: constTrue,
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
