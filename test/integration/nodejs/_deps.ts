import {
  createBetterSqliteDriver,
  createTimingSafeEqual,
} from "../../../packages/nodejs/src/index.ts";
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
import type { RandomLibDep } from "../../../packages/common/src/Random.ts";
import type {
  CreateSqliteDriverDep,
  SqliteDep,
} from "../../../packages/common/src/Sqlite.ts";
import { testSetupSqlite } from "../../../packages/common/src/Sqlite.ts";
import type { DisposableRun } from "../../../packages/common/src/Task.ts";
import { maxMillis, type Millis } from "../../../packages/common/src/Time.ts";

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
