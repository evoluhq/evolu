import { describe, expect, test } from "vitest";
import { NonEmptyReadonlyArray } from "../../src/Array.js";
import { CallbackId } from "../../src/Callbacks.js";
import { createConsole } from "../../src/Console.js";
import { Config, defaultConfig } from "../../src/Evolu/Config.js";
import {
  createDbWorkerForPlatform,
  DbWorker,
  DbWorkerOutput,
  DbWorkerPlatformDeps,
} from "../../src/Evolu/Db.js";
import { DbSchema, MutationChange } from "../../src/Evolu/Schema.js";
import { DbChange } from "../../src/Evolu/Storage.js";
import { wait } from "../../src/Promise.js";
import { getOrThrow } from "../../src/Result.js";
import { createSqlite, sql, Sqlite } from "../../src/Sqlite.js";
import { Id, idToBinaryId } from "../../src/Type.js";
import {
  testCreateDummyWebSocket,
  testCreateId,
  testCreateSqliteDriver,
  testNanoIdLib,
  testOwnerBinaryId,
  testOwnerSecret,
  testRandom,
  testRandomBytes,
  testSimpleName,
  testTime,
} from "../_deps.js";
import { testTimestampsAsc } from "./_fixtures.js";
import { getDbSnapshot } from "./_utils.js";
import { createAppOwner } from "../../src/index.js";

const createSimpleTestSchema = (): DbSchema => {
  return {
    tables: [
      {
        name: "testTable",
        columns: ["id", "name"],
      },
      {
        name: "_testTable",
        columns: ["id", "name"],
      },
    ],
    indexes: [],
  };
};

const createSqliteWithDbWorkerPlatformDeps = async (): Promise<
  [Sqlite, DbWorkerPlatformDeps]
> => {
  const sqliteDriver = await testCreateSqliteDriver(testSimpleName);
  const createSqliteDriver = () => Promise.resolve(sqliteDriver);
  const sqlite = getOrThrow(
    await createSqlite({ createSqliteDriver })(testSimpleName),
  );

  const deps: DbWorkerPlatformDeps = {
    console: createConsole(),
    createSqliteDriver,
    createWebSocket: testCreateDummyWebSocket,
    nanoIdLib: testNanoIdLib,
    random: testRandom,
    randomBytes: testRandomBytes,
    time: testTime,
  };
  return [sqlite, deps];
};

const setupInitializedDbWorker = async ({
  callbackBeforeInit,
  externalAppOwner,
}: {
  callbackBeforeInit?: (db: DbWorker) => void;
  externalAppOwner?: boolean;
} = {}): Promise<[Array<DbWorkerOutput>, Sqlite, DbWorker]> => {
  const [sqlite, deps] = await createSqliteWithDbWorkerPlatformDeps();
  const db = createDbWorkerForPlatform(deps);

  const dbWorkerOutput: Array<DbWorkerOutput> = [];
  db.onMessage((message) => dbWorkerOutput.push(message));

  // Execute callback before initialization if provided
  if (callbackBeforeInit) {
    callbackBeforeInit(db);
  }

  const config: Config = externalAppOwner
    ? {
        ...defaultConfig,
        externalAppOwner: createAppOwner(testOwnerSecret),
      }
    : defaultConfig;

  db.postMessage({
    type: "init",
    config,
    dbSchema: createSimpleTestSchema(),
  });

  // async createSqliteDriver
  await wait(10);

  return [dbWorkerOutput, sqlite, db];
};

// Helper for posting mutations with common defaults
const postMutation = (
  db: DbWorker,
  changes: NonEmptyReadonlyArray<MutationChange>,
  tabId = testCreateId(),
): void => {
  db.postMessage({
    type: "mutate",
    tabId,
    changes,
    onCompleteIds: [],
    subscribedQueries: [],
  });
};

const createTestChange = (
  id = testCreateId(),
  table = "testTable",
  values: Record<string, string | number | null> = { name: "test" },
): DbChange => ({ id, table, values });

const getHistoryCount = (
  sqlite: Sqlite,
  table: string,
  recordId: Id,
  column: string,
): number => {
  const result = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_history
      where
        "table" = ${table}
        and "id" = ${idToBinaryId(recordId)}
        and "column" = ${column};
    `),
  );
  return result.rows[0].count;
};

const getLatestValue = (
  sqlite: Sqlite,
  table: string,
  recordId: Id,
  column: string,
): string => {
  const result = getOrThrow(
    sqlite.exec<Record<string, string>>(sql`
      select ${sql.identifier(column)}
      from ${sql.identifier(table)}
      where id = ${recordId};
    `),
  );
  return result.rows[0][column];
};

const getHistoryValues = (
  sqlite: Sqlite,
  table: string,
  recordId: Id,
  column: string,
): Array<string> => {
  const result = getOrThrow(
    sqlite.exec<{ value: string }>(sql`
      select value
      from evolu_history
      where
        "table" = ${table}
        and "id" = ${idToBinaryId(recordId)}
        and "column" = ${column}
      order by timestamp;
    `),
  );
  return result.rows.map((row) => row.value);
};

describe("createDbWorker initializes", () => {
  test("with on-device created AppOwner", async () => {
    const [dbWorkerOutput, sqlite] = await setupInitializedDbWorker();

    expect(dbWorkerOutput).toMatchSnapshot();
    expect(getDbSnapshot({ sqlite })).toMatchSnapshot();
  });

  test("with external AppOwner", async () => {
    const [dbWorkerOutput, sqlite] = await setupInitializedDbWorker({
      externalAppOwner: true,
    });

    expect(dbWorkerOutput).toMatchSnapshot();
    expect(getDbSnapshot({ sqlite })).toMatchSnapshot();
  });
});

test("mutations", async () => {
  const [dbWorkerOutput, sqlite, db] = await setupInitializedDbWorker();

  postMutation(db, [createTestChange()]);

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("mutate before init", async () => {
  const [dbWorkerOutput, sqlite] = await setupInitializedDbWorker({
    callbackBeforeInit: (db) => {
      // This runs BEFORE init
      postMutation(db, [createTestChange(testCreateId(), "_testTable")]);
    },
  });

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("local mutation", async () => {
  const [dbWorkerOutput, sqlite, db] = await setupInitializedDbWorker();

  const change = createTestChange(testCreateId(), "_testTable");

  postMutation(db, [change]);

  expect(dbWorkerOutput).toMatchSnapshot();
  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();

  // Test deletion
  postMutation(db, [
    {
      ...change,
      values: {
        ...change.values,
        isDeleted: 1,
      },
    },
  ]);

  expect(getDbSnapshot({ sqlite }).tables).toMatchSnapshot();
});

test("reset", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  db.postMessage({
    type: "reset",
    reload: false,
    onCompleteId: testNanoIdLib.nanoid() as CallbackId,
  });

  expect(getDbSnapshot({ sqlite })).toMatchSnapshot();
});

test("evolu_history unique index prevents duplicates", async () => {
  const [, sqlite] = await setupInitializedDbWorker();

  const ownerId = testOwnerBinaryId;
  const table = "testTable";
  const id = idToBinaryId(testCreateId());
  const column = "name";
  const value = "test value";
  const timestamp = testTimestampsAsc[0];

  // Manually insert the same record twice
  sqlite.exec(sql`
    insert into evolu_history
      ("ownerId", "table", "id", "column", "value", "timestamp")
    values
      (${ownerId}, ${table}, ${id}, ${column}, ${value}, ${timestamp})
    on conflict do nothing;
  `);
  sqlite.exec(sql`
    insert into evolu_history
      ("ownerId", "table", "id", "column", "value", "timestamp")
    values
      (${ownerId}, ${table}, ${id}, ${column}, ${value}, ${timestamp})
    on conflict do nothing;
  `);

  const count = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count from evolu_history;
    `),
  );
  expect(count.rows[0].count).toBe(1);
});

test("timestamp ordering - newer mutations overwrite older ones", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();

  // Create first mutation
  postMutation(db, [
    createTestChange(recordId, "testTable", { name: "first_value" }),
  ]);
  await wait(10);

  // Create second mutation on same record (will have newer timestamp)
  postMutation(db, [
    createTestChange(recordId, "testTable", { name: "second_value" }),
  ]);
  await wait(10);

  // Verify the app table has the latest value
  expect(getLatestValue(sqlite, "testTable", recordId, "name")).toBe(
    "second_value",
  );

  // Verify both mutations are stored in history
  expect(getHistoryCount(sqlite, "testTable", recordId, "name")).toBe(2);
});

test("timestamp ordering - multiple columns update independently", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();

  // Create first mutation that sets the name
  postMutation(db, [
    createTestChange(recordId, "testTable", { name: "original_name" }),
  ]);
  await wait(10);

  // Update the same record with a different value for name
  postMutation(db, [
    createTestChange(recordId, "testTable", { name: "updated_name" }),
  ]);
  await wait(10);

  // Verify the app table has the latest name value
  expect(getLatestValue(sqlite, "testTable", recordId, "name")).toBe(
    "updated_name",
  );

  // Verify we have two entries in history for the name column
  expect(getHistoryCount(sqlite, "testTable", recordId, "name")).toBe(2);

  // Verify the values are stored in chronological order in history
  const historyValues = getHistoryValues(sqlite, "testTable", recordId, "name");
  expect(historyValues[0]).toBe("original_name");
  expect(historyValues[1]).toBe("updated_name");
});

test("timestamp ordering - concurrent mutations on different records", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId1 = testCreateId();
  const recordId2 = testCreateId();

  // Create mutations on different records in quick succession
  postMutation(db, [
    createTestChange(recordId1, "testTable", { name: "record1_value" }),
    createTestChange(recordId2, "testTable", { name: "record2_value" }),
  ]);
  await wait(10);

  // Verify both records exist with correct values
  expect(getLatestValue(sqlite, "testTable", recordId1, "name")).toBe(
    "record1_value",
  );
  expect(getLatestValue(sqlite, "testTable", recordId2, "name")).toBe(
    "record2_value",
  );

  // Verify both records have entries in history
  const totalHistoryCount = getOrThrow(
    sqlite.exec<{ count: number }>(sql`
      select count(*) as count
      from evolu_history
      where "table" = 'testTable' and "column" = 'name';
    `),
  );
  expect(totalHistoryCount.rows[0].count).toBe(2);
});

test("timestamp ordering - verify CRDT last-write-wins behavior", async () => {
  const [, sqlite, db] = await setupInitializedDbWorker();

  const recordId = testCreateId();
  const mutations = ["initial", "second", "third", "final"];

  // Create initial value
  postMutation(db, [
    createTestChange(recordId, "testTable", { name: mutations[0] }),
  ]);
  await wait(10);

  // Update multiple times rapidly to ensure different timestamps
  for (let i = 1; i < mutations.length; i++) {
    postMutation(db, [
      createTestChange(recordId, "testTable", { name: mutations[i] }),
    ]);
    await wait(5);
  }

  await wait(10);

  // Verify app table has the final value (last write wins)
  expect(getLatestValue(sqlite, "testTable", recordId, "name")).toBe("final");

  // Verify all mutations are preserved in history in timestamp order
  const historyValues = getHistoryValues(sqlite, "testTable", recordId, "name");
  expect(historyValues).toHaveLength(4);
  expect(historyValues).toEqual(mutations);

  // Verify that the app table always reflects the value with the highest timestamp
  const timestampResults = getOrThrow(
    sqlite.exec<{ value: string; timestamp: Uint8Array }>(sql`
      select value, timestamp
      from evolu_history
      where
        "table" = 'testTable'
        and "id" = ${idToBinaryId(recordId)}
        and "column" = 'name'
      order by timestamp desc
      limit 1;
    `),
  );

  expect(timestampResults.rows[0].value).toBe("final");
});
